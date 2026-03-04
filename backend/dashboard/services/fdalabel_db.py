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
    def get_sqlite_connection(cls):
        """Establishes a connection to the local SQLite label.db."""
        try:
            db_path = current_app.config.get('LOCAL_LABEL_DB_PATH')
            if not db_path:
                db_path = os.path.join(current_app.root_path, '..', '..', 'data', 'label.db')
            db_path = os.path.abspath(db_path)
            if not os.path.exists(db_path):
                return None
            connection = sqlite3.connect(db_path)
            connection.row_factory = sqlite3.Row
            return connection
        except Exception as e:
            print(f"SQLite Connection Failed: {e}")
            return None

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
        db_choice = current_app.config.get('LABEL_DB', 'LOCAL')
        
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

        # Default SQLite
        conn = cls.get_sqlite_connection()
        if conn:
            cls._db_type = 'sqlite'
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
                # Local Path (Postgres or SQLite)
                schema = "labeling." if cls._db_type == 'postgres' else ""
                sql = f"""
                    SELECT set_id, product_names, generic_names, manufacturer, market_categories, appr_num,
                           ndc_codes, revised_date, active_ingredients, doc_type, dosage_forms, routes, epc, is_rld, is_rs
                    FROM {schema}sum_spl
                    WHERE product_names LIKE :q OR generic_names LIKE :q OR ndc_codes LIKE :q_exact OR set_id = :q_exact_id
                    LIMIT :limit OFFSET :skip
                """
                params = {"q": q, "q_exact": query, "q_exact_id": query, "limit": limit, "skip": skip}
                if cls._db_type == 'postgres':
                    # Postgres uses %s or named %(name)s
                    sql = sql.replace(":q_exact_id", "%(q_exact_id)s").replace(":q_exact", "%(q_exact)s").replace(":q", "%(q)s").replace(":limit", "%(limit)s").replace(":skip", "%(skip)s")
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
        for i in range(0, len(items), n): yield items[i:i+n]
