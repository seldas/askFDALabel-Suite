from flask import Blueprint, request, jsonify
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path
from collections import defaultdict

drugtox_bp = Blueprint('drugtox', __name__)

# Database Configuration
# Adjusting paths for unified app (running from backend/)
BACKEND_DIR = Path(__file__).resolve().parent.parent # .../backend
PROJECT_DIR = BACKEND_DIR.parent                    # .../askFDALabel-Suite
DEFAULT_DB_PATH = (PROJECT_DIR / "data" / "afd.db").resolve()

DB_PATH = Path(os.environ.get("DRUGTOX_DB_PATH", str(DEFAULT_DB_PATH))).resolve()
DB_URL = f"sqlite:///{DB_PATH}"
engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db_session():
    return SessionLocal()

@drugtox_bp.route("/drugs")
def get_drugs():
    q = request.args.get('q')
    tox_type = request.args.get('tox_type')
    show_historical = request.args.get('show_historical', 'false').lower() == 'true'
    changed_only = request.args.get('changed_only', 'false').lower() == 'true'
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    
    offset = (page - 1) * limit
    base_query = "FROM drug_toxicity"
    params = {"limit": limit, "offset": offset}
    
    conditions = []
    if not show_historical:
        conditions.append("is_historical = 0")
    if changed_only:
        conditions.append("Changed = 'Yes'")
    if q:
        conditions.append("(Trade_Name LIKE :q OR Generic_Proper_Names LIKE :q)")
        params["q"] = f"%{q}%"
    if tox_type:
        conditions.append("Tox_Type = :tox_type")
        params["tox_type"] = tox_type

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    db = get_db_session()
    try:
        # Get total count
        count_result = db.execute(text(f"SELECT COUNT(*) {base_query} {where_clause}"), params)
        total_count = count_result.scalar()

        # Get paginated data
        query = text(f"SELECT SETID, Trade_Name, Generic_Proper_Names, Toxicity_Class, Author_Organization, Tox_Type, SPL_Effective_Time, Changed, is_historical {base_query} {where_clause} ORDER BY SPL_Effective_Time DESC LIMIT :limit OFFSET :offset")
        result = db.execute(query, params)
        drugs = [dict(row._mapping) for row in result]
        
        return jsonify({
            "items": drugs,
            "total": total_count,
            "page": page,
            "limit": limit
        })
    finally:
        db.close()

@drugtox_bp.route("/stats")
def get_stats():
    tox_type = request.args.get('tox_type')
    db = get_db_session()
    try:
        where_clause = "WHERE is_historical = 0"
        params = {}
        if tox_type:
            where_clause += " AND Tox_Type = :tox"
            params["tox"] = tox_type
            
        query = text(f"SELECT Toxicity_Class, COUNT(*) as count FROM drug_toxicity {where_clause} GROUP BY Toxicity_Class")
        result = db.execute(query, params)
        distribution = [dict(row._mapping) for row in result]
        
        change_query = text(f"SELECT COUNT(*) FROM drug_toxicity {where_clause} AND Changed = 'Yes'")
        total_changes = db.execute(change_query, params).scalar()
        
        return jsonify({
            "distribution": distribution,
            "total_changes": total_changes
        })
    finally:
        db.close()

@drugtox_bp.route("/companies/<company_name>/stats")
def get_company_stats(company_name):
    tox_type = request.args.get('tox_type')
    db = get_db_session()
    try:
        where_clause = "WHERE is_historical = 0 AND Author_Organization = :company"
        params = {"company": company_name}
        if tox_type:
            where_clause += " AND Tox_Type = :tox"
            params["tox"] = tox_type
            
        query = text(f"SELECT Toxicity_Class, COUNT(*) as count FROM drug_toxicity {where_clause} GROUP BY Toxicity_Class")
        result = db.execute(query, params)
        distribution = [dict(row._mapping) for row in result]
        
        total_query = text(f"SELECT COUNT(*) FROM drug_toxicity {where_clause}")
        total_drugs = db.execute(total_query, params).scalar()
        
        return jsonify({
            "distribution": distribution,
            "total_drugs": total_drugs
        })
    finally:
        db.close()

@drugtox_bp.route("/companies/<company_name>/portfolio")
def get_company_portfolio(company_name):
    tox_type = request.args.get('tox_type')
    db = get_db_session()
    try:
        where_clause = "WHERE is_historical = 0 AND Author_Organization = :company"
        params = {"company": company_name}
        if tox_type:
            where_clause += " AND Tox_Type = :tox"
            params["tox"] = tox_type
            
        query = text(f"SELECT SETID, Trade_Name, Generic_Proper_Names, Toxicity_Class, SPL_Effective_Time, Changed "
                     f"FROM drug_toxicity {where_clause} ORDER BY Trade_Name ASC")
        result = db.execute(query, params)
        return jsonify([dict(row._mapping) for row in result])
    finally:
        db.close()

@drugtox_bp.route("/discrepancies")
def get_discrepancies():
    tox_type = request.args.get('tox_type')
    tox_map = {"No": 0, "Precaution": 1, "Less": 2, "Most": 3}
    
    where_clause = "WHERE is_historical = 0"
    params = {}
    if tox_type:
        where_clause += " AND Tox_Type = :tox"
        params["tox"] = tox_type

    db = get_db_session()
    try:
        query = text(f"SELECT Generic_Proper_Names, Author_Organization, Toxicity_Class, Trade_Name, SETID "
                     f"FROM drug_toxicity {where_clause}")
        rows = db.execute(query, params).fetchall()
        
        groups = defaultdict(list)
        for r in rows:
            groups[r.Generic_Proper_Names].append(dict(r._mapping))
            
        discrepancies = []
        for generic_name, items in groups.items():
            unique_classes = set(item['Toxicity_Class'] for item in items)
            if len(unique_classes) > 1:
                scores = [tox_map.get(c, 0) for c in unique_classes]
                gap = max(scores) - min(scores)
                sorted_classes = sorted(list(unique_classes), key=lambda x: tox_map.get(x, 0))
                discrepancies.append({
                    "generic_name": generic_name,
                    "tox_range": f"{sorted_classes[0]} to {sorted_classes[-1]}",
                    "severity_gap": gap,
                    "manufacturer_count": len(items),
                    "classes_found": sorted_classes,
                    "details": items
                })
        discrepancies.sort(key=lambda x: (-x['severity_gap'], x['generic_name']))
        return jsonify(discrepancies)
    finally:
        db.close()

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
