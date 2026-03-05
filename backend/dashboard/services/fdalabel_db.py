import os
import sqlite3
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import current_app

# Graceful import for oracledb
try:
    import oracledb
    ORACLE_AVAILABLE = True
except ImportError:
    ORACLE_AVAILABLE = False
    print("Warning: oracledb not installed. Internal DB features disabled.")

class FDALabelDBService:
    _is_connected = None  # Tri-state: None (unknown), True (connected), False (failed)
    _db_type = None      # 'oracle', 'sqlite', or 'postgres'

    @classmethod
    def get_postgres_connection(cls):
        """Establishes a connection to the local PostgreSQL database."""
        try:
            dsn = current_app.config.get('DATABASE_URL')
            if not dsn:
                return None
            # Use RealDictCursor to mimic SQLite Row behavior
            connection = psycopg2.connect(dsn, cursor_factory=RealDictCursor)
            return connection
        except Exception as e:
            print(f"Postgres Connection Failed: {e}")
            return None

    @classmethod
    def get_connection(cls):
        """Establishes a connection based on Config.LABEL_DB."""
        db_choice = current_app.config.get('LABEL_DB', 'POSTGRES')
        
        if db_choice == 'ORACLE':
            if not ORACLE_AVAILABLE: return None
            try:
                user = current_app.config.get('FDALABEL_DB_USER')
                psw = current_app.config.get('FDALABEL_DB_PASSWORD')
                host = current_app.config.get('FDALABEL_DB_HOST')
                port = current_app.config.get('FDALABEL_DB_PORT')
                service = current_app.config.get('FDALABEL_DB_SERVICE')
                if psw and host and port and service:
                    dsnStr = oracledb.makedsn(host, port, service)
                    connection = oracledb.connect(user=user, password=psw, dsn=dsnStr)
                    cls._db_type = 'oracle'
                    return connection
            except Exception: return None

        if db_choice == 'POSTGRES':
            conn = cls.get_postgres_connection()
            if conn:
                cls._db_type = 'postgres'
            return conn

        # Default to Postgres if LABEL_DB is not set or not 'ORACLE'
        conn = cls.get_postgres_connection()
        if conn:
            cls._db_type = 'postgres'
        return conn

    @classmethod
    def is_available(cls):
        if cls._is_connected is not None:
            return cls._is_connected
        conn = cls.get_connection()
        if conn:
            cls._is_connected = True
            conn.close()
        else:
            cls._is_connected = False
        return cls._is_connected

    @classmethod
    def is_internal(cls):
        return cls.is_available() and cls._db_type == 'oracle'

    @classmethod
    def is_local(cls):
        return cls.is_available() and cls._db_type in ('sqlite', 'postgres')

    @classmethod
    def check_connectivity(cls):
        return cls.is_available()

    @classmethod
    def search_labels(cls, query, skip=0, limit=100000):
        if not cls.check_connectivity(): return []
        conn = cls.get_connection()
        if not conn: return []
        results = []
        try:
            cursor = conn.cursor()
            q = f"%{query}%"
            if cls._db_type == 'oracle':
                sql = """
                    SELECT SET_ID, PRODUCT_NAMES, PRODUCT_NORMD_GENERIC_NAMES, AUTHOR_ORG_NORMD_NAME, 
                           MARKET_CATEGORIES, APPR_NUM, NDC_CODES, EFF_TIME, ACT_INGR_NAMES, 
                           LABELING_TYPE, DOSAGE_FORMS, ROUTES, EPC, 0 as IS_RLD, 0 as IS_RS
                    FROM druglabel.DGV_SUM_SPL
                    WHERE UPPER(TITLE) LIKE UPPER(:q) OR UPPER(PRODUCT_NAMES) LIKE UPPER(:q) OR
                          UPPER(PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:q) OR NDC_CODES LIKE :q_exact OR SET_ID = :q_exact_id
                    OFFSET :skip ROWS FETCH NEXT :limit ROWS ONLY
                """
                cursor.execute(sql, {"q": q, "q_exact": query, "q_exact_id": query, "skip": skip, "limit": limit})
                rows = cursor.fetchall()
                for r in rows:
                    results.append({
                        'set_id': r[0], 'brand_name': (r[1] or "").replace(';', ', '),
                        'generic_name': (r[2] or "").replace(';', ', '), 'manufacturer_name': r[3],
                        'effective_time': r[7], 'label_format': 'FDALabel', 'application_number': r[5],
                        'market_category': r[4], 'ndc': r[6], 'active_ingredients': r[8],
                        'labeling_type': r[9], 'dosage_forms': r[10], 'routes': r[11], 'epc': r[12],
                        'is_rld': r[13], 'is_rs': r[14] if len(r) > 14 else 0
                    })
            else:
                # Postgres
                schema = "labeling."
                sql = f"""
                    SELECT set_id, product_names, generic_names, manufacturer, market_categories, appr_num,
                           ndc_codes, revised_date, active_ingredients, doc_type, dosage_forms, routes, epc, is_rld, is_rs
                    FROM {schema}sum_spl
                    WHERE product_names LIKE %(q)s OR generic_names LIKE %(q)s OR ndc_codes LIKE %(q_exact)s OR set_id = %(q_exact_id)s
                    LIMIT %(limit)s OFFSET %(skip)s
                """
                params = {"q": q, "q_exact": query, "q_exact_id": query, "limit": limit, "skip": skip}
                cursor.execute(sql, params)
                rows = cursor.fetchall()
                for r in rows:
                    results.append({
                        'set_id': r['set_id'], 'brand_name': (r['product_names'] or "").replace(';', ', '),
                        'generic_name': (r['generic_names'] or "").replace(';', ', '), 'manufacturer_name': r['manufacturer'] or "",
                        'effective_time': (r['revised_date'] or "").replace('-', ''), 'label_format': 'FDALabel (Local)',
                        'application_number': r['appr_num'] or "", 'market_category': r['market_categories'] or "",
                        'ndc': r['ndc_codes'] or "", 'active_ingredients': r['active_ingredients'],
                        'labeling_type': r['doc_type'], 'dosage_forms': r['dosage_forms'], 'routes': r['routes'],
                        'epc': r['epc'], 'is_rld': r['is_rld'], 'is_rs': r['is_rs']
                    })
            cursor.close()
        except Exception as e: print(f"Search Error: {e}")
        finally: conn.close()
        return results

    @classmethod
    def get_label_metadata(cls, set_id):
        if not cls.check_connectivity(): return None
        conn = cls.get_connection()
        if not conn: return None
        try:
            cursor = conn.cursor()
            if cls._db_type == 'oracle':
                sql = "SELECT SET_ID, PRODUCT_NAMES, PRODUCT_NORMD_GENERIC_NAMES, AUTHOR_ORG_NORMD_NAME, MARKET_CATEGORIES, APPR_NUM, NDC_CODES, EFF_TIME, ACT_INGR_NAMES, LABELING_TYPE, DOSAGE_FORMS, ROUTES, EPC, (SELECT COUNT(*) FROM druglabel.sum_spl_rld rld WHERE rld.SPL_ID = s.SPL_ID) as IS_RLD FROM druglabel.DGV_SUM_SPL s WHERE s.SET_ID = :sid"
                cursor.execute(sql, {"sid": set_id})
                r = cursor.fetchone()
                if r:
                    return {'set_id': r[0], 'brand_name': (r[1] or "").replace(';', ', '), 'generic_name': (r[2] or "").replace(';', ', '), 'manufacturer_name': r[3], 'effective_time': r[7], 'label_format': 'FDALabel', 'application_number': r[5], 'market_category': r[4], 'ndc': r[6], 'active_ingredients': r[8], 'labeling_type': r[9], 'dosage_forms': r[10], 'routes': r[11], 'epc': r[12], 'is_rld': bool(r[13]), 'is_rs': False}
            else:
                schema = "labeling." if cls._db_type == 'postgres' else ""
                sql = f"SELECT * FROM {schema}sum_spl WHERE set_id = %s LIMIT 1" if cls._db_type == 'postgres' else f"SELECT * FROM sum_spl WHERE set_id = ? LIMIT 1"
                cursor.execute(sql, (set_id,))
                r = cursor.fetchone()
                if r:
                    return {'set_id': r['set_id'], 'brand_name': (r['product_names'] or "").replace(';', ', '), 'generic_name': (r['generic_names'] or "").replace(';', ', '), 'manufacturer_name': r['manufacturer'] or "", 'effective_time': r['revised_date'], 'label_format': 'FDALabel (Local)', 'application_number': r['appr_num'] or "", 'market_category': r['market_categories'] or "", 'ndc': r['ndc_codes'] or "", 'active_ingredients': r['active_ingredients'], 'labeling_type': r['doc_type'], 'dosage_forms': r['dosage_forms'], 'routes': r['routes'], 'epc': r['epc'], 'is_rld': bool(r['is_rld']), 'is_rs': bool(r['is_rs'])}
        except Exception as e: print(f"Metadata Error: {e}")
        finally: conn.close()
        return None

    @classmethod
    def get_full_xml(cls, set_id):
        if not cls.check_connectivity(): return None
        conn = cls.get_connection()
        if not conn: return None
        try:
            cursor = conn.cursor()
            schema = "labeling." if cls._db_type == 'postgres' else ""
            sql = f"SELECT local_path FROM {schema}sum_spl WHERE set_id = %s" if cls._db_type == 'postgres' else f"SELECT local_path FROM sum_spl WHERE set_id = ?"
            cursor.execute(sql, (set_id,))
            r = cursor.fetchone()
            if r and r['local_path']:
                storage_dir = current_app.config.get('SPL_STORAGE_DIR', os.path.join(current_app.root_path, '..', 'data', 'spl_storage'))
                zip_path = os.path.abspath(os.path.join(storage_dir, r['local_path']))
                if os.path.exists(zip_path):
                    import zipfile
                    with zipfile.ZipFile(zip_path, 'r') as z:
                        xml_f = [f for f in z.namelist() if f.endswith('.xml')]
                        if xml_f: return z.read(xml_f[0]).decode('utf-8', errors='replace')
        finally: conn.close()
        return None

    @classmethod
    def local_search(cls, query_term, skip=0, limit=50, human_rx_only=False, rld_only=False):
        if not cls.check_connectivity(): return []
        conn = cls.get_connection()
        if not conn: return []
        try:
            cursor = conn.cursor()
            q = f"%{query_term}%"
            if cls._db_type == 'oracle':
                where = ["(UPPER(PRODUCT_NAMES) LIKE UPPER(:q) OR UPPER(PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:q) OR UPPER(SET_ID) = UPPER(:sid) OR UPPER(APPR_NUM) LIKE UPPER(:q))"]
                params = {"q": q, "sid": query_term}
                if human_rx_only: where.append("DOCUMENT_TYPE_LOINC_CODE IN ('34391-3', '48401-4', '48402-2')")
                if rld_only: where.append("EXISTS (SELECT 1 FROM druglabel.sum_spl_rld rld WHERE rld.SPL_ID = druglabel.DGV_SUM_SPL.SPL_ID)")
                sql = f"SELECT SET_ID, PRODUCT_NAMES, PRODUCT_NORMD_GENERIC_NAMES, AUTHOR_ORG_NORMD_NAME, APPR_NUM, NDC_CODES, EFF_TIME, MARKET_CATEGORIES, DOCUMENT_TYPE FROM druglabel.DGV_SUM_SPL WHERE {' AND '.join(where)} ORDER BY EFF_TIME DESC"
                cursor.execute(sql, params)
            else:
                schema = "labeling." if cls._db_type == 'postgres' else ""
                where = ["(product_names LIKE :q OR generic_names LIKE :q OR set_id = :sid OR appr_num LIKE :q)"]
                params = {"q": q, "sid": query_term, "limit": limit, "offset": skip}
                if human_rx_only: where.append("(doc_type LIKE '%HUMAN PRESCRIPTION%' OR doc_type IN ('34391-3', '48401-4', '48402-2'))")
                if rld_only: where.append("(is_rld = 1 OR is_rs = 1)")
                sql = f"SELECT set_id, product_names, generic_names, manufacturer, appr_num, ndc_codes, revised_date, market_categories, doc_type, local_path FROM {schema}sum_spl WHERE {' AND '.join(where)} ORDER BY revised_date DESC LIMIT :limit OFFSET :offset"
                if cls._db_type == 'postgres':
                    sql = sql.replace(":limit", "%(limit)s").replace(":offset", "%(offset)s").replace(":sid", "%(sid)s").replace(":q", "%(q)s")
                cursor.execute(sql, params)
            rows = cursor.fetchall()
            results = []
            for r in rows:
                if cls._db_type == 'oracle':
                    results.append({'set_id': r[0], 'brand_name': (r[1] or "").replace(';', ', '), 'generic_name': (r[2] or "").replace(';', ', '), 'manufacturer': r[3], 'appr_num': r[4], 'ndc': r[5], 'revised_date': r[6], 'market_category': r[7], 'doc_type': r[8], 'source': 'Oracle'})
                else:
                    results.append({'set_id': r['set_id'], 'brand_name': (r['product_names'] or "").replace(';', ', '), 'generic_name': (r['generic_names'] or "").replace(';', ', '), 'manufacturer': r['manufacturer'], 'appr_num': r['appr_num'], 'ndc': r['ndc_codes'], 'revised_date': r['revised_date'], 'market_category': r['market_categories'], 'doc_type': r['doc_type'], 'local_path': r['local_path'], 'source': f'Local {cls._db_type.capitalize()}'})
            return results
        finally: conn.close()

    @classmethod
    def get_autocomplete_suggestions(cls, query, limit=10, human_rx_only=False, rld_only=False):
        if not cls.check_connectivity(): return []
        conn = cls.get_connection()
        if not conn: return []
        try:
            cursor = conn.cursor()
            q = f"%{query}%"
            if cls._db_type == 'oracle':
                where = ["(UPPER(PRODUCT_NAMES) LIKE UPPER(:q) OR UPPER(PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:q))"]
                if human_rx_only: where.append("DOCUMENT_TYPE_LOINC_CODE IN ('34391-3', '48401-4', '48402-2')")
                if rld_only: where.append("EXISTS (SELECT 1 FROM druglabel.sum_spl_rld rld WHERE rld.SPL_ID = druglabel.DGV_SUM_SPL.SPL_ID)")
                sql = f"SELECT DISTINCT PRODUCT_NAMES, PRODUCT_NORMD_GENERIC_NAMES FROM druglabel.DGV_SUM_SPL WHERE {' AND '.join(where)} FETCH NEXT 50 ROWS ONLY"
                cursor.execute(sql, {"q": q})
            else:
                schema = "labeling." if cls._db_type == 'postgres' else ""
                where = ["(product_names LIKE :q OR generic_names LIKE :q)"]
                if human_rx_only: where.append("(doc_type LIKE '%HUMAN PRESCRIPTION%' OR doc_type IN ('34391-3', '48401-4', '48402-2'))")
                if rld_only: where.append("(is_rld = 1 OR is_rs = 1)")
                sql = f"SELECT DISTINCT product_names, generic_names FROM {schema}sum_spl WHERE {' AND '.join(where)} LIMIT 50"
                if cls._db_type == 'postgres': sql = sql.replace(":q", "%(q)s")
                cursor.execute(sql, {"q": q})
            rows = cursor.fetchall()
            suggestions = set()
            qu = query.upper()
            for r in rows:
                p = (r[0] if cls._db_type == 'oracle' else r['product_names']) or ""
                g = (r[1] if cls._db_type == 'oracle' else r['generic_names']) or ""
                for n in (p.split(';') + g.split(';')):
                    n = n.strip()
                    if n and qu in n.upper():
                        suggestions.add(n)
                        if len(suggestions) >= limit: break
                if len(suggestions) >= limit: break
            return sorted(list(suggestions))
        finally: conn.close()

    @classmethod
    def get_random_labels(cls, limit=5, human_rx_only=False, rld_only=False):
        if not cls.check_connectivity(): return []
        conn = cls.get_connection()
        if not conn: return []
        try:
            cursor = conn.cursor()
            if cls._db_type == 'oracle':
                where = []
                if human_rx_only: where.append("DOCUMENT_TYPE_LOINC_CODE IN ('34391-3', '48401-4', '48402-2')")
                if rld_only: where.append("EXISTS (SELECT 1 FROM druglabel.sum_spl_rld rld WHERE rld.SPL_ID = druglabel.DGV_SUM_SPL.SPL_ID)")
                w_stmt = f"WHERE {' AND '.join(where)}" if where else ""
                sql = f"SELECT * FROM (SELECT SET_ID, PRODUCT_NAMES, PRODUCT_NORMD_GENERIC_NAMES, AUTHOR_ORG_NORMD_NAME, APPR_NUM, NDC_CODES, EFF_TIME, MARKET_CATEGORIES, DOCUMENT_TYPE FROM druglabel.DGV_SUM_SPL {w_stmt} ORDER BY DBMS_RANDOM.VALUE) WHERE ROWNUM <= :limit"
                cursor.execute(sql, {"limit": limit})
            else:
                schema = "labeling." if cls._db_type == 'postgres' else ""
                where = []
                if human_rx_only: where.append("(doc_type LIKE '%HUMAN PRESCRIPTION%' OR doc_type IN ('34391-3', '48401-4', '48402-2'))")
                if rld_only: where.append("(is_rld = 1 OR is_rs = 1)")
                w_stmt = f"WHERE {' AND '.join(where)}" if where else ""
                sql = f"SELECT set_id, product_names, generic_names, manufacturer, appr_num, ndc_codes, revised_date, market_categories, doc_type, local_path FROM {schema}sum_spl {w_stmt} ORDER BY {'RANDOM()' if cls._db_type == 'postgres' else 'RANDOM()'} LIMIT :limit"
                if cls._db_type == 'postgres': sql = sql.replace(":limit", "%(limit)s")
                cursor.execute(sql, {"limit": limit})
            rows = cursor.fetchall()
            results = []
            for r in rows:
                if cls._db_type == 'oracle':
                    results.append({'set_id': r[0], 'brand_name': (r[1] or "").replace(';', ', '), 'generic_name': (r[2] or "").replace(';', ', '), 'manufacturer': r[3], 'appr_num': r[4], 'ndc': r[5], 'revised_date': r[6], 'market_category': r[7], 'doc_type': r[8], 'source': 'Oracle'})
                else:
                    results.append({'set_id': r['set_id'], 'brand_name': (r['product_names'] or "").replace(';', ', '), 'generic_name': (r['generic_names'] or "").replace(';', ', '), 'manufacturer': r['manufacturer'], 'appr_num': r['appr_num'], 'ndc': r['ndc_codes'], 'revised_date': r['revised_date'], 'market_category': r['market_categories'], 'doc_type': r['doc_type'], 'local_path': r['local_path'], 'source': f'Local {cls._db_type.capitalize()}'})
            return results
        finally: conn.close()

    @classmethod
    def _chunk(cls, items, n=900):
        for i in range(0, len(items), n):
            yield items[i:i+n]

    @classmethod
    def get_label_core_by_set_ids(cls, set_ids):
        if not set_ids or not cls.check_connectivity():
            return {}

        conn = cls.get_connection()
        if not conn:
            return {}

        out = {}
        try:
            if cls._db_type == 'oracle':
                cursor = conn.cursor()
                for chunk in cls._chunk(list(set_ids), n=900):
                    binds = {f"sid{i}": v for i, v in enumerate(chunk)}
                    in_clause = ", ".join([f":sid{i}" for i in range(len(chunk))])
                    sql = f"SELECT SET_ID, SPL_ID, DOCUMENT_TYPE, DOCUMENT_TYPE_LOINC_CODE FROM druglabel.DGV_SUM_SPL WHERE SET_ID IN ({in_clause})"
                    cursor.execute(sql, binds)
                    for set_id, spl_id, doc_type, doc_loinc in cursor.fetchall():
                        out[str(set_id)] = {"spl_id": spl_id, "document_type": doc_type, "document_type_loinc_code": doc_loinc}
                cursor.close()
            else:
                cursor = conn.cursor()
                schema = "labeling." if cls._db_type == 'postgres' else ""
                for chunk in cls._chunk(list(set_ids), n=900):
                    sql = f"SELECT set_id, spl_id, doc_type FROM {schema}sum_spl WHERE set_id = ANY(%s)"
                    cursor.execute(sql, chunk)
                    for row in cursor.fetchall():
                        out[str(row['set_id'])] = {"spl_id": row['spl_id'], "document_type": row['doc_type'], "document_type_loinc_code": None}
                cursor.close()
        except Exception as e:
            print(f"Error in get_label_core_by_set_ids ({cls._db_type}): {e}")
        finally:
            conn.close()
        return out

    @classmethod
    def effective_time_map_for_set_ids(cls, set_ids):
        """Fetches EFF_TIME/revised_date for multiple set_ids."""
        if not set_ids or not cls.check_connectivity():
            return {}

        conn = cls.get_connection()
        if not conn:
            return {}

        out = {}
        try:
            cursor = conn.cursor()
            if cls._db_type == 'oracle':
                for chunk in cls._chunk(list(set_ids), n=900):
                    binds = {f"sid{i}": v for i, v in enumerate(chunk)}
                    in_clause = ", ".join([f":sid{i}" for i in range(len(chunk))])
                    sql = f"SELECT SET_ID, EFF_TIME FROM druglabel.DGV_SUM_SPL WHERE SET_ID IN ({in_clause})"
                    cursor.execute(sql, binds)
                    for sid, eff in cursor.fetchall():
                        out[str(sid)] = eff
            else:
                for chunk in cls._chunk(list(set_ids), n=900):
                    sql = f"SELECT set_id, revised_date FROM sum_spl WHERE set_id = ANY(%s)"
                    cursor.execute(sql, chunk)
                    for row in cursor.fetchall():
                        out[str(row['set_id'])] = row['revised_date']
            cursor.close()
        except Exception as e:
            print(f"Error in effective_time_map_for_set_ids ({cls._db_type}): {e}")
        finally:
            conn.close()
        return out

    @classmethod
    def ingredient_role_breakdown_for_set_ids(cls, set_ids, substance_name):
        """Analyzes active/inactive ingredient roles for a set of labels."""
        if not set_ids or not substance_name or not cls.check_connectivity():
            return {"query": substance_name, "active_count": 0, "inactive_count": 0, "both_count": 0, "not_found_count": len(set_ids or []), "matches": {}}

        conn = cls.get_connection()
        if not conn: return {}

        matches = {} # {set_id: {active: bool, inactive: bool}}
        try:
            cursor = conn.cursor()
            search_name = substance_name.strip().upper()
            
            if cls._db_type == 'oracle':
                # Oracle logic
                for chunk in cls._chunk(list(set_ids), n=900):
                    binds = {f"sid{i}": v for i, v in enumerate(chunk)}
                    binds['q'] = search_name
                    in_clause = ", ".join([f":sid{i}" for i in range(len(chunk))])
                    sql = f"""
                        SELECT s.SET_ID, m.IS_ACTIVE 
                        FROM druglabel.active_ingredients_map m
                        JOIN druglabel.DGV_SUM_SPL s ON s.SPL_ID = m.SPL_ID
                        WHERE s.SET_ID IN ({in_clause})
                        AND UPPER(m.SUBSTANCE_NAME) = :q
                    """
                    cursor.execute(sql, binds)
                    for sid, is_act in cursor.fetchall():
                        sid_str = str(sid)
                        if sid_str not in matches: matches[sid_str] = {"active": False, "inactive": False}
                        if is_act == 'Y' or is_act == 1: matches[sid_str]["active"] = True
                        else: matches[sid_str]["inactive"] = True
            else:
                schema = "labeling." if cls._db_type == 'postgres' else ""
                for chunk in cls._chunk(list(set_ids), n=900):
                    sql = f"""
                        SELECT s.set_id, m.is_active
                        FROM {schema}active_ingredients_map m
                        JOIN {schema}sum_spl s ON s.spl_id = m.spl_id
                        WHERE s.set_id = ANY(%s)
                        AND UPPER(m.substance_name) = %s
                    """
                    cursor.execute(sql, (list(chunk), search_name))
                    for row in cursor.fetchall():
                        sid_str = str(row['set_id'])
                        if sid_str not in matches: matches[sid_str] = {"active": False, "inactive": False}
                        if row['is_active'] == 1: matches[sid_str]["active"] = True
                        else: matches[sid_str]["inactive"] = True
            cursor.close()
        except Exception as e:
            print(f"Error in ingredient_role_breakdown ({cls._db_type}): {e}")
        finally:
            conn.close()

        # Count roles
        active_c, inactive_c, both_c = 0, 0, 0
        found_set_ids = set(matches.keys())
        for sid, roles in matches.items():
            if roles["active"] and roles["inactive"]: both_c += 1
            elif roles["active"]: active_c += 1
            else: inactive_c += 1
            
        return {
            "query": substance_name,
            "active_count": active_c,
            "inactive_count": inactive_c,
            "both_count": both_c,
            "not_found_count": len(set_ids) - len(found_set_ids),
            "matches": matches
        }

    @classmethod
    def document_type_breakdown_for_set_ids(cls, set_ids):
        """Categorizes labels by document type using LOINC codes (DB query version)."""
        if not set_ids or not cls.check_connectivity():
            return {"raw": {}, "buckets": {"human_rx": 0, "human_otc": 0, "vaccine": 0, "animal_rx": 0, "animal_otc": 0, "other": 0, "unknown": 0}}

        conn = cls.get_connection()
        if not conn:
            return {"raw": {}, "buckets": {"human_rx": 0, "human_otc": 0, "vaccine": 0, "animal_rx": 0, "animal_otc": 0, "other": 0, "unknown": 0}}

        # Same mappings as your original implementation
        LOINC_MAP = {
            '34391-3': 'human_rx', '48401-4': 'human_rx', '48402-2': 'human_rx',
            '34390-5': 'human_otc', '48405-5': 'human_otc', '48406-3': 'human_otc',
            '34392-1': 'vaccine', '50516-4': 'vaccine',
            '50517-2': 'animal_rx', '50518-0': 'animal_otc',
        }

        STR_MAP = {
            'HUMAN PRESCRIPTION DRUG LABEL': 'human_rx',
            'HUMAN OTC DRUG LABEL': 'human_otc',
            'VACCINE LABEL': 'vaccine',
            'ANIMAL PRESCRIPTION DRUG LABEL': 'animal_rx',
            'ANIMAL OTC DRUG LABEL': 'animal_otc',
        }

        raw = {}
        buckets = {"human_rx": 0, "human_otc": 0, "vaccine": 0, "animal_rx": 0, "animal_otc": 0, "other": 0, "unknown": 0}

        # Track which set_ids we actually saw in DB results (so we can count missing ones as UNKNOWN)
        seen = set()

        try:
            cursor = conn.cursor()

            if cls._db_type == 'oracle':
                # Adjust these column names if needed for Oracle schema
                for chunk in cls._chunk(list(set_ids), n=900):
                    binds = {f"sid{i}": v for i, v in enumerate(chunk)}
                    in_clause = ", ".join([f":sid{i}" for i in range(len(chunk))])

                    sql = f"""
                        SELECT
                            s.SET_ID,
                            s.DOCUMENT_TYPE_LOINC_CODE,
                            s.DOCUMENT_TYPE
                        FROM druglabel.DGV_SUM_SPL s
                        WHERE s.SET_ID IN ({in_clause})
                    """
                    cursor.execute(sql, binds)

                    for set_id, loinc_code, doc_type in cursor.fetchall():
                        sid_str = str(set_id)
                        seen.add(sid_str)

                        # Match original fallback order
                        code = loinc_code or doc_type or "UNKNOWN"
                        code_str = str(code)
                        raw[code_str] = raw.get(code_str, 0) + 1

            else:
                schema = "labeling."
                for chunk in cls._chunk(list(set_ids), n=900):
                    sql = f"""
                        SELECT
                            s.set_id,
                            s.doc_type
                        FROM {schema}sum_spl s
                        WHERE s.set_id = ANY(%s)
                    """
                    cursor.execute(sql, (list(chunk),))

                    for row in cursor.fetchall():
                        set_id = row["set_id"]
                        doc_type = row["doc_type"]
                        sid_str = str(set_id)
                        seen.add(sid_str)

                        code = doc_type or "UNKNOWN"
                        code_str = str(code)
                        raw[code_str] = raw.get(code_str, 0) + 1
            cursor.close()

        except Exception as e:
            print(f"Error in document_type_breakdown ({cls._db_type}): {e}")
            # Return empty but well-formed output
            return {"raw": {}, "buckets": buckets}
        finally:
            conn.close()

        # Anything not returned from DB counts as UNKNOWN (matches old behavior when core.get(...) empty)
        missing = len(set_ids) - len(seen)
        if missing > 0:
            raw["UNKNOWN"] = raw.get("UNKNOWN", 0) + missing

        # Bucketize
        for code, count in raw.items():
            mapped = False
            code_str = str(code)

            if code_str in LOINC_MAP:
                buckets[LOINC_MAP[code_str]] += count
                mapped = True
            else:
                upper_code = code_str.upper()
                for key, bucket in STR_MAP.items():
                    if key in upper_code:
                        buckets[bucket] += count
                        mapped = True
                        break

            if not mapped:
                if code_str == "UNKNOWN":
                    buckets["unknown"] += count
                else:
                    buckets["other"] += count

        return {"raw": raw, "buckets": buckets}

    @classmethod
    def get_drug_info(cls, drug_name):
        if not cls.check_connectivity():
            return None

        conn = cls.get_connection()
        if not conn:
            return None

        try:
            if cls._db_type == 'oracle':
                cursor = conn.cursor()
                query = """
                    SELECT 
                        s.SET_ID, s.APPR_NUM, s.PRODUCT_NAMES, 
                        s.PRODUCT_NORMD_GENERIC_NAMES, s.ACT_INGR_NAMES,
                        rld.RLD, s.EFF_TIME
                    FROM druglabel.DGV_SUM_SPL s
                    LEFT JOIN druglabel.sum_spl_rld rld on rld.spl_id = s.spl_id
                    WHERE (UPPER(s.PRODUCT_NAMES) LIKE UPPER(:dn) OR 
                           UPPER(s.PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:dn) OR 
                           UPPER(s.ACT_INGR_NAMES) LIKE UPPER(:dn))
                    ORDER BY rld.RLD DESC, s.EFF_TIME DESC
                    FETCH FIRST 1 ROWS ONLY
                """
                cursor.execute(query, {"dn": drug_name})
                row = cursor.fetchone()
                if not row:
                    cursor.execute(query, {"dn": f"%{drug_name}%"})
                    row = cursor.fetchone()
                
                if row:
                    return {
                        "set_id": row[0], "appr_num": row[1], "product_name": row[2],
                        "generic_name": row[3], "active_ingredients": row[4],
                        "is_RLD": row[5], "effective_date": row[6]
                    }
                cursor.close()
            else:
                schema = "labeling." if cls._db_type == 'postgres' else ""
                cursor = conn.cursor()
                query = f"""
                    SELECT 
                        set_id, appr_num, product_names, 
                        generic_names, active_ingredients,
                        is_rld, is_rs, revised_date
                    FROM {schema}sum_spl
                    WHERE product_names LIKE :dn OR 
                          generic_names LIKE :dn OR 
                          active_ingredients LIKE :dn
                    ORDER BY is_rld DESC, is_rs DESC, revised_date DESC
                    LIMIT 1
                """
                cursor.execute(query, {"dn": drug_name})
                row = cursor.fetchone()
                if not row:
                    cursor.execute(query, {"dn": f"%{drug_name}%"})
                    row = cursor.fetchone()
                
                if row:
                    return {
                        "set_id": row['set_id'], "appr_num": row['appr_num'], "product_name": row['product_names'],
                        "generic_name": row['generic_names'], "active_ingredients": row['active_ingredients'],
                        "is_RLD": "Yes" if row['is_rld'] else "No", 
                        "is_RS": "Yes" if row['is_rs'] else "No",
                        "effective_date": row['revised_date']
                    }
                cursor.close()
        except Exception as e:
            print(f"Error in get_drug_info ({cls._db_type}): {e}")
        finally:
            conn.close()
        return None

    @classmethod
    def get_label_metadata(cls, set_id):
        """Fetches detailed metadata for a single drug label from the internal DB."""
        if not cls.check_connectivity():
            return None

        conn = cls.get_connection()
        if not conn:
            return None

        try:
            if cls._db_type == 'oracle':
                cursor = conn.cursor()
                sql = """
                    SELECT 
                        s.SET_ID, s.PRODUCT_NAMES, s.PRODUCT_NORMD_GENERIC_NAMES,
                        s.AUTHOR_ORG_NORMD_NAME, s.MARKET_CATEGORIES, s.APPR_NUM,
                        s.NDC_CODES, s.EFF_TIME, s.ACT_INGR_NAMES, s.LABELING_TYPE,
                        s.DOSAGE_FORMS, s.ROUTES, s.EPC,
                        (SELECT COUNT(*) FROM druglabel.sum_spl_rld rld WHERE rld.SPL_ID = s.SPL_ID) as IS_RLD
                    FROM druglabel.DGV_SUM_SPL s
                    WHERE s.SET_ID = :sid
                """
                cursor.execute(sql, {"sid": set_id})
                row = cursor.fetchone()
                if row:
                    from datetime import datetime
                    try:
                        eff_time = datetime.strptime(row[7], '%Y%m%d').strftime('%B %d, %Y')
                    except:
                        eff_time = row[7]
                    return {
                        'set_id': row[0],
                        'brand_name': (row[1] or "").replace(';', ', '),
                        'generic_name': (row[2] or "").replace(';', ', '),
                        'manufacturer_name': row[3],
                        'effective_time': eff_time,
                        'label_format': 'FDALabel',
                        'application_number': row[5],
                        'market_category': row[4],
                        'ndc': row[6],
                        'active_ingredients': row[8],
                        'labeling_type': row[9],
                        'dosage_forms': row[10],
                        'routes': row[11],
                        'epc': row[12],
                        'is_rld': bool(row[13]),
                        'is_rs': False # Oracle mapping needs check if RS is in internal DB
                    }
                cursor.close()
            else:
                schema = "labeling." if cls._db_type == 'postgres' else ""
                cursor = conn.cursor()
                sql = f"""
                    SELECT 
                        set_id, product_names, generic_names,
                        manufacturer, market_categories, appr_num,
                        ndc_codes, revised_date, active_ingredients,
                        doc_type, dosage_forms, routes, epc, is_rld, is_rs
                    FROM {schema}sum_spl
                    WHERE set_id = ?
                """
                cursor.execute(sql, (set_id,))
                row = cursor.fetchone()
                if row:
                    return {
                        'set_id': row['set_id'],
                        'brand_name': (row['product_names'] or "").replace(';', ', '),
                        'generic_name': (row['generic_names'] or "").replace(';', ', '),
                        'manufacturer_name': row['manufacturer'] or "",
                        'effective_time': row['revised_date'],
                        'label_format': 'FDALabel (Local)',
                        'application_number': row['appr_num'] or "",
                        'market_category': row['market_categories'] or "",
                        'ndc': row['ndc_codes'] or "",
                        'active_ingredients': row['active_ingredients'],
                        'labeling_type': row['doc_type'],
                        'dosage_forms': row['dosage_forms'],
                        'routes': row['routes'],
                        'epc': row['epc'],
                        'is_rld': bool(row['is_rld']),
                        'is_rs': bool(row['is_rs'])
                    }
                cursor.close()
        except Exception as e:
            print(f"Error fetching metadata from FDALabel DB ({cls._db_type}): {e}")
        finally:
            conn.close()
        return None

    @classmethod
    def get_labels_by_set_ids_for_export(cls, set_ids):
        """
        Fetches all fields from sum_spl for a list of set_ids, formatted for Excel export.
        """
        if not set_ids or not cls.check_connectivity():
            return []

        conn = cls.get_connection()
        if not conn:
            return []

        try:
            cursor = conn.cursor()
            results = []
            
            # Handle Oracle and SQLite separately
            if cls._db_type == 'oracle':
                # Oracle remains the same
                for chunk in cls._chunk(list(set_ids), n=900):
                    binds = {f"sid{i}": v for i, v in enumerate(chunk)}
                    in_clause = ", ".join([f":sid{i}" for i in range(len(chunk))])
                    sql = f"""
                        SELECT 
                            SET_ID, PRODUCT_NAMES, PRODUCT_NORMD_GENERIC_NAMES,
                            AUTHOR_ORG_NORMD_NAME, APPR_NUM, NDC_CODES, EFF_TIME,
                            MARKET_CATEGORIES, DOCUMENT_TYPE, ROUTES, DOSAGE_FORMS,
                            EPC, ACT_INGR_NAMES
                        FROM druglabel.DGV_SUM_SPL
                        WHERE SET_ID IN ({in_clause})
                    """
                    cursor.execute(sql, binds)
                    rows = cursor.fetchall()
                    for row in rows:
                        results.append({
                            'SET ID': row[0],
                            'Trade Name': (row[1] or "").replace(';', ', '),
                            'Generic/Proper Name(s)': (row[2] or "").replace(';', ', '),
                            'Company': row[3],
                            'Application Number(s)': row[4],
                            'NDC(s)': row[5],
                            'SPL Effective Date (YYYY/MM/DD)': row[6],
                            'Marketing Category': row[7],
                            'Labeling Type': row[8],
                            'Route(s) of Administration': row[9],
                            'Dosage Form(s)': row[10],
                            'Established Pharmacologic Class(es)': row[11],
                            'Active Ingredient(s)': (row[12] or "").replace(';', ', '),
                            'FDALabel Link': f"https://nctr-crs.fda.gov/fdalabel/ui/search/spl/{row[0]}",
                            'DailyMed SPL Link': f"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={row[0]}",
                            'DailyMed PDF Link': f"https://dailymed.nlm.nih.gov/dailymed/getpdf.cfm?setid={row[0]}"
                        })
            else:
                schema = "labeling."
                for chunk in cls._chunk(list(set_ids), n=900):
                    sql = f"""
                        SELECT 
                            set_id, product_names, generic_names, manufacturer, 
                            appr_num, ndc_codes, revised_date, market_categories,
                            doc_type, routes, dosage_forms, epc, active_ingredients
                        FROM {schema}sum_spl
                        WHERE set_id = ANY(%s)
                    """
                    params = chunk
                    if cls._db_type == 'postgres':
                        cursor.execute(sql, params)
                    else:
                        cursor.execute(sql, params)
                    rows = cursor.fetchall()
                    for row in rows:
                        rev_date = row['revised_date'] or ""
                        if len(rev_date) == 8 and rev_date.isdigit():
                            rev_date = f"{rev_date[0:4]}/{rev_date[4:6]}/{rev_date[6:8]}"

                        results.append({
                            'SET ID': row['set_id'],
                            'Trade Name': (row['product_names'] or "").replace(';', ', '),
                            'Generic/Proper Name(s)': (row['generic_names'] or "").replace(';', ', '),
                            'Company': row['manufacturer'],
                            'Application Number(s)': row['appr_num'],
                            'NDC(s)': row['ndc_codes'],
                            'SPL Effective Date (YYYY/MM/DD)': rev_date,
                            'Marketing Category': row['market_categories'],
                            'Labeling Type': row['doc_type'],
                            'Route(s) of Administration': row['routes'],
                            'Dosage Form(s)': row['dosage_forms'],
                            'Established Pharmacologic Class(es)': row['epc'],
                            'Active Ingredient(s)': (row['active_ingredients'] or "").replace(';', ', '),
                            'FDALabel Link': f"https://nctr-crs.fda.gov/fdalabel/ui/search/spl/{row['set_id']}",
                            'DailyMed SPL Link': f"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={row['set_id']}",
                            'DailyMed PDF Link': f"https://dailymed.nlm.nih.gov/dailymed/getpdf.cfm?setid={row['set_id']}"
                        })
            return results
        except Exception as e:
            print(f"Error in FDALabelDBService.get_labels_by_set_ids_for_export: {e}")
            return []
        finally:
            conn.close()

    @classmethod
    def get_labels_for_export(cls, query_term):
        """
        Fetches all fields from sum_spl for a given query, formatted for Excel export.
        """
        if not cls.check_connectivity():
            return []

        conn = cls.get_connection()
        if not conn:
            return []

        try:
            cursor = conn.cursor()
            q = f"%{query_term}%"
            
            if cls._db_type == 'oracle':
                # Similar to local_search but for Oracle if needed
                sql = """
                    SELECT 
                        SET_ID, PRODUCT_NAMES, PRODUCT_NORMD_GENERIC_NAMES,
                        AUTHOR_ORG_NORMD_NAME, APPR_NUM, NDC_CODES, EFF_TIME,
                        MARKET_CATEGORIES, DOCUMENT_TYPE, ROUTES, DOSAGE_FORMS,
                        EPC, ACT_INGR_NAMES
                    FROM druglabel.DGV_SUM_SPL
                    WHERE 
                        UPPER(PRODUCT_NAMES) LIKE UPPER(:q) OR
                        UPPER(PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:q) OR
                        UPPER(SET_ID) = UPPER(:sid) OR
                        UPPER(APPR_NUM) LIKE UPPER(:q)
                    ORDER BY EFF_TIME DESC
                """
                cursor.execute(sql, {"q": q, "sid": query_term})
                rows = cursor.fetchall()
                results = []
                for row in rows:
                    results.append({
                        'SET ID': row[0],
                        'Trade Name': (row[1] or "").replace(';', ', '),
                        'Generic/Proper Name(s)': (row[2] or "").replace(';', ', '),
                        'Company': row[3],
                        'Application Number(s)': row[4],
                        'NDC(s)': row[5],
                        'SPL Effective Date (YYYY/MM/DD)': row[6],
                        'Marketing Category': row[7],
                        'Labeling Type': row[8],
                        'Route(s) of Administration': row[9],
                        'Dosage Form(s)': row[10],
                        'Established Pharmacologic Class(es)': row[11],
                        'Active Ingredient(s)': (row[12] or "").replace(';', ', '),
                        'FDALabel Link': f"https://nctr-crs.fda.gov/fdalabel/ui/search/spl/{row[0]}",
                        'DailyMed SPL Link': f"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={row[0]}",
                        'DailyMed PDF Link': f"https://dailymed.nlm.nih.gov/dailymed/getpdf.cfm?setid={row[0]}"
                    })
                return results
            else:
                # SQLite Search
                schema = "labeling." if cls._db_type == 'postgres' else ""
                sql = f"""
                    SELECT 
                        set_id, product_names, generic_names, manufacturer, 
                        appr_num, ndc_codes, revised_date, market_categories,
                        doc_type, routes, dosage_forms, epc, active_ingredients
                    FROM {schema}sum_spl
                    WHERE 
                        product_names LIKE ? OR
                        generic_names LIKE ? OR
                        set_id = ? OR
                        appr_num LIKE ?
                    ORDER BY revised_date DESC
                """
                cursor.execute(sql, (q, q, query_term, q))
                rows = cursor.fetchall()
                results = []
                for row in rows:
                    # Format revised_date if it's YYYYMMDD to YYYY/MM/DD
                    rev_date = row['revised_date'] or ""
                    if len(rev_date) == 8 and rev_date.isdigit():
                        rev_date = f"{rev_date[0:4]}/{rev_date[4:6]}/{rev_date[6:8]}"

                    results.append({
                        'SET ID': row['set_id'],
                        'Trade Name': (row['product_names'] or "").replace(';', ', '),
                        'Generic/Proper Name(s)': (row['generic_names'] or "").replace(';', ', '),
                        'Company': row['manufacturer'],
                        'Application Number(s)': row['appr_num'],
                        'NDC(s)': row['ndc_codes'],
                        'SPL Effective Date (YYYY/MM/DD)': rev_date,
                        'Marketing Category': row['market_categories'],
                        'Labeling Type': row['doc_type'],
                        'Route(s) of Administration': row['routes'],
                        'Dosage Form(s)': row['dosage_forms'],
                        'Established Pharmacologic Class(es)': row['epc'],
                        'Active Ingredient(s)': (row['active_ingredients'] or "").replace(';', ', '),
                        'FDALabel Link': f"https://nctr-crs.fda.gov/fdalabel/ui/search/spl/{row['set_id']}",
                        'DailyMed SPL Link': f"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={row['set_id']}",
                        'DailyMed PDF Link': f"https://dailymed.nlm.nih.gov/dailymed/getpdf.cfm?setid={row['set_id']}"
                    })
                return results
            
        except Exception as e:
            print(f"Error in FDALabelDBService.get_labels_for_export: {e}")
            return []
        finally:
            conn.close()
