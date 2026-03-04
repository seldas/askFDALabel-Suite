from flask import Blueprint, request, jsonify, current_app
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path
from collections import defaultdict
import sqlite3

drugtox_bp = Blueprint('drugtox', __name__)

def get_db_session():
    db_path = current_app.config.get('DRUGTOX_DB_PATH')
    if not db_path:
        db_path = os.path.join(current_app.root_path, '..', '..', 'data', 'afd.db')
    db_path = os.path.abspath(db_path)
    engine = create_engine(f'sqlite:///{db_path}')
    Session = sessionmaker(bind=engine)
    return Session()

@drugtox_bp.route("/stats")
def get_stats():
    tox_type = request.args.get('tox_type', 'DILI')
    db = get_db_session()
    try:
        dist_query = text("SELECT Toxicity_Class, COUNT(*) as count FROM drug_toxicity WHERE Tox_Type = :tox AND is_historical = 0 GROUP BY Toxicity_Class")
        dist = db.execute(dist_query, {"tox": tox_type}).fetchall()
        
        changes_query = text("SELECT COUNT(*) FROM drug_toxicity WHERE Tox_Type = :tox AND is_historical = 0 AND Changed = 'Yes'")
        total_changes = db.execute(changes_query, {"tox": tox_type}).scalar()
        
        return jsonify({
            "distribution": [dict(r._mapping) for r in dist],
            "total_changes": total_changes
        })
    finally:
        db.close()

@drugtox_bp.route("/drugs")
def get_drugs():
    q = request.args.get('q', '')
    tox_type = request.args.get('tox_type', 'DILI')
    show_historical = request.args.get('show_historical') == 'true'
    changed_only = request.args.get('changed_only') == 'true'
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    offset = (page - 1) * limit

    db = get_db_session()
    try:
        where_clauses = ["Tox_Type = :tox"]
        params = {"tox": tox_type, "limit": limit, "offset": offset}
        
        if q:
            where_clauses.append("(Trade_Name LIKE :q OR Generic_Proper_Names LIKE :q OR Author_Organization LIKE :q)")
            params["q"] = f"%{q}%"
        
        if not show_historical:
            where_clauses.append("is_historical = 0")
            
        if changed_only:
            where_clauses.append("Changed = 'Yes'")
            
        where_clause = " AND ".join(where_clauses)
        
        query = text(f"SELECT * FROM drug_toxicity WHERE {where_clause} ORDER BY Trade_Name ASC LIMIT :limit OFFSET :offset")
        rows = db.execute(query, params).fetchall()
        
        count_query = text(f"SELECT COUNT(*) FROM drug_toxicity WHERE {where_clause}")
        total = db.execute(count_query, params).scalar()
        
        return jsonify({
            "items": [dict(r._mapping) for r in rows],
            "total": total
        })
    finally:
        db.close()

@drugtox_bp.route("/discrepancies")
def get_discrepancies():
    tox_type = request.args.get('tox_type', 'DILI')
    tox_map = {'Most': 3, 'Less': 2, 'No': 1, 'Precaution': 0, 'Unknown': 0}
    
    where_clause = "WHERE Tox_Type = :tox AND is_historical = 0"
    params = {"tox": tox_type}
    
    db = get_db_session()
    
    # 1. Connect to local label.db to find RLD status
    from dashboard.services.fdalabel_db import FDALabelDBService
    
    try:
        query = text(f"SELECT Generic_Proper_Names, Author_Organization, Toxicity_Class, Trade_Name, SETID "
                     f"FROM drug_toxicity {where_clause}")
        rows = db.execute(query, params).fetchall()
        
        groups = defaultdict(list)
        for r in rows:
            groups[r.Generic_Proper_Names].append(dict(r._mapping))
            
        discrepancies_raw = []
        generic_names_to_check = []

        for generic_name, items in groups.items():
            unique_classes = set(item['Toxicity_Class'] for item in items)
            if len(unique_classes) > 1:
                generic_names_to_check.append(generic_name)
                # Initial structure
                discrepancies_raw.append({
                    "generic_name": generic_name,
                    "items": items,
                    "unique_classes": unique_classes
                })

        # BATCH FETCH RLD/RS STATUS
        rld_map = {} # generic_name -> set_id
        rs_map = {} # generic_name -> set_id
        if generic_names_to_check and FDALabelDBService.is_available():
            conn_lbl = FDALabelDBService.get_connection()
            if conn_lbl:
                try:
                    cursor = conn_lbl.cursor()
                    if FDALabelDBService._db_type == 'oracle':
                        # Oracle batch check
                        for gn in generic_names_to_check[:50]:
                             sql = "SELECT SET_ID FROM druglabel.DGV_SUM_SPL s JOIN druglabel.sum_spl_rld rld ON s.SPL_ID = rld.SPL_ID WHERE UPPER(PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:gn) AND ROWNUM = 1"
                             cursor.execute(sql, {"gn": f"%{gn}%"})
                             r_row = cursor.fetchone()
                             if r_row: rld_map[gn] = r_row[0]
                    else:
                        # SQLite Optimized
                        for gn in generic_names_to_check:
                            # Prefer RLD then RS
                            sql = "SELECT set_id, is_rld, is_rs FROM sum_spl WHERE generic_names LIKE ? AND (is_rld = 1 OR is_rs = 1) ORDER BY is_rld DESC, is_rs DESC, revised_date DESC LIMIT 1"
                            cursor.execute(sql, (f"%{gn}%",))
                            r_row = cursor.fetchone()
                            if r_row:
                                sid = r_row['set_id']
                                if r_row['is_rld']:
                                    rld_map[gn] = sid
                                elif r_row['is_rs']:
                                    rs_map[gn] = sid
                finally:
                    conn_lbl.close()

        # Batch fetch toxicity for found RLDs/RSs
        ref_tox_map = {}
        ref_set_ids = list(set(list(rld_map.values()) + list(rs_map.values())))
        if ref_set_ids:
            for i in range(0, len(ref_set_ids), 900):
                chunk = ref_set_ids[i:i+900]
                placeholders = ",".join([f":s{j}" for j in range(len(chunk))])
                binds = {f"s{j}": sid for j, sid in enumerate(chunk)}
                binds['tox'] = tox_type
                
                tox_query = text(f"SELECT SETID, Toxicity_Class FROM drug_toxicity WHERE SETID IN ({placeholders}) AND Tox_Type = :tox AND is_historical = 0")
                t_rows = db.execute(tox_query, binds).fetchall()
                for tr in t_rows:
                    ref_tox_map[tr.SETID] = tr.Toxicity_Class

        discrepancies = []
        for raw in discrepancies_raw:
            generic_name = raw['generic_name']
            items = raw['items']
            unique_classes = raw['unique_classes']
            
            scores = [tox_map.get(c, 0) for c in unique_classes]
            gap = max(scores) - min(scores)
            sorted_classes = sorted(list(unique_classes), key=lambda x: tox_map.get(x, 0))

            found_rld_sid = rld_map.get(generic_name)
            found_rs_sid = rs_map.get(generic_name)
            
            ref_sid = found_rld_sid or found_rs_sid
            rld_info = {
                "status": "Unknown", 
                "setid": ref_sid,
                "is_rld": bool(found_rld_sid),
                "is_rs": bool(found_rs_sid)
            }
            if ref_sid:
                rld_info["status"] = ref_tox_map.get(ref_sid, "Not evaluated")

            discrepancies.append({
                "generic_name": generic_name,
                "tox_range": f"{sorted_classes[0]} to {sorted_classes[-1]}",
                "severity_gap": gap,
                "manufacturer_count": len(items),
                "classes_found": sorted_classes,
                "details": items,
                "rld_info": rld_info
            })
        
        discrepancies.sort(key=lambda x: (-x['severity_gap'], x['generic_name']))
        return jsonify(discrepancies)
    except Exception as e:
        current_app.logger.error(f"Discrepancies error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

@drugtox_bp.route("/latest_rld")
def get_latest_rld():
    generic_name = request.args.get('generic_name')
    if not generic_name: return jsonify({"error": "Missing generic_name"}), 400
    
    from dashboard.services.fdalabel_db import FDALabelDBService
    if not FDALabelDBService.is_available():
        return jsonify({"error": "Label database not available"}), 503
        
    conn = None
    try:
        conn = FDALabelDBService.get_connection()
        cursor = conn.cursor()
        
        # 1. Search for latest RLD
        if FDALabelDBService._db_type == 'oracle':
            sql = """
                SELECT s.SET_ID, s.PRODUCT_NAMES 
                FROM druglabel.DGV_SUM_SPL s 
                JOIN druglabel.sum_spl_rld rld ON s.SPL_ID = rld.SPL_ID 
                WHERE UPPER(s.PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:gn) 
                ORDER BY s.EFF_TIME DESC
            """
            cursor.execute(sql, {"gn": f"%{generic_name}%"})
        else:
            sql = """
                SELECT set_id, product_names FROM sum_spl 
                WHERE generic_names LIKE ? AND is_rld = 1 
                ORDER BY revised_date DESC
            """
            cursor.execute(sql, (f"%{generic_name}%",))
            
        row = cursor.fetchone()
        if row:
            sid = row[0] if isinstance(row, tuple) else row['set_id']
            return jsonify({"set_id": sid, "is_rld": True})
            
        # 2. If no RLD, fallback to latest labeling
        if FDALabelDBService._db_type == 'oracle':
            sql = "SELECT SET_ID FROM druglabel.DGV_SUM_SPL WHERE UPPER(PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:gn) ORDER BY EFF_TIME DESC"
            cursor.execute(sql, {"gn": f"%{generic_name}%"})
        else:
            sql = "SELECT set_id FROM sum_spl WHERE generic_names LIKE ? ORDER BY revised_date DESC"
            cursor.execute(sql, (f"%{generic_name}%",))
            
        row = cursor.fetchone()
        if row:
            sid = row[0] if isinstance(row, tuple) else row['set_id']
            return jsonify({"set_id": sid, "is_rld": False})
            
        return jsonify({"error": "No labeling found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()

@drugtox_bp.route("/autocomplete")
def autocomplete():
    q = request.args.get('q', '')
    limit = int(request.args.get('limit', 10))
    if not q: return jsonify([])
    
    db = get_db_session()
    try:
        query = text("SELECT DISTINCT Trade_Name FROM drug_toxicity WHERE Trade_Name LIKE :q AND is_historical = 0 LIMIT :limit")
        result = db.execute(query, {"q": f"%{q}%", "limit": limit})
        suggestions = [row[0] for row in result]
        return jsonify(suggestions)
    finally:
        db.close()

@drugtox_bp.route("/drugs/<setid>/history")
def get_drug_history(setid):
    tox_type = request.args.get('tox_type')
    db = get_db_session()
    try:
        res = db.execute(text("SELECT Generic_Proper_Names, Tox_Type, Author_Organization FROM drug_toxicity WHERE SETID = :setid LIMIT 1"), {"setid": setid})
        row = res.fetchone()
        if not row: return jsonify([])
        
        generic_name, current_tox_type, company = row[0], (tox_type or row[1]), row[2]
        history_res = db.execute(
            text("SELECT SETID, Toxicity_Class, SPL_Effective_Time, is_historical, Changed, Update_Notes, Trade_Name, Author_Organization "
                 "FROM drug_toxicity WHERE Generic_Proper_Names = :name AND Tox_Type = :tox AND Author_Organization = :company ORDER BY SPL_Effective_Time DESC"),
            {"name": generic_name, "tox": current_tox_type, "company": company}
        )
        return jsonify([dict(r._mapping) for r in history_res])
    finally:
        db.close()

@drugtox_bp.route("/drugs/<setid>")
def get_drug_detail(setid):
    tox_type = request.args.get('tox_type')
    db = get_db_session()
    try:
        if tox_type:
            result = db.execute(text("SELECT * FROM drug_toxicity WHERE SETID = :setid AND Tox_Type = :tox_type"), {"setid": setid, "tox_type": tox_type})
        else:
            result = db.execute(text("SELECT * FROM drug_toxicity WHERE SETID = :setid"), {"setid": setid})
        row = result.fetchone()
        if row: return jsonify(dict(row._mapping))
        return jsonify({"error": "Drug not found"}), 404
    finally:
        db.close()

@drugtox_bp.route("/drugs/<setid>/market")
def get_drug_market(setid):
    tox_type = request.args.get('tox_type')
    db = get_db_session()
    try:
        res = db.execute(text("SELECT Generic_Proper_Names, Tox_Type FROM drug_toxicity WHERE SETID = :setid LIMIT 1"), {"setid": setid})
        row = res.fetchone()
        if not row: return jsonify([])
        generic_name, current_tox_type = row[0], (tox_type or row[1])
        market_res = db.execute(
            text("SELECT SETID, Trade_Name, Author_Organization, Toxicity_Class, SPL_Effective_Time "
                 "FROM drug_toxicity WHERE Generic_Proper_Names = :name AND Tox_Type = :tox AND is_historical = 0 AND SETID != :setid"),
            {"name": generic_name, "tox": current_tox_type, "setid": setid}
        )
        return jsonify([dict(r._mapping) for r in market_res])
    finally:
        db.close()

@drugtox_bp.route("/companies/<path:company_name>/stats")
def get_company_stats(company_name):
    tox_type = request.args.get('tox_type', 'DILI')
    db = get_db_session()
    try:
        dist_query = text("SELECT Toxicity_Class, COUNT(*) as count FROM drug_toxicity WHERE Author_Organization = :company AND Tox_Type = :tox AND is_historical = 0 GROUP BY Toxicity_Class")
        dist = db.execute(dist_query, {"company": company_name, "tox": tox_type}).fetchall()
        
        count_query = text("SELECT COUNT(*) FROM drug_toxicity WHERE Author_Organization = :company AND Tox_Type = :tox AND is_historical = 0")
        total_drugs = db.execute(count_query, {"company": company_name, "tox": tox_type}).scalar()
        
        return jsonify({
            "distribution": [dict(r._mapping) for r in dist],
            "total_drugs": total_drugs
        })
    finally:
        db.close()

@drugtox_bp.route("/companies/<path:company_name>/portfolio")
def get_company_portfolio(company_name):
    tox_type = request.args.get('tox_type', 'DILI')
    db = get_db_session()
    try:
        query = text("SELECT SETID, Trade_Name, Generic_Proper_Names, Toxicity_Class, Author_Organization, Tox_Type, SPL_Effective_Time, Changed FROM drug_toxicity WHERE Author_Organization = :company AND Tox_Type = :tox AND is_historical = 0")
        rows = db.execute(query, {"company": company_name, "tox": tox_type}).fetchall()
        return jsonify([dict(r._mapping) for r in rows])
    finally:
        db.close()
