import os
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

    @classmethod
    def get_connection(cls):
        """Establishes a connection to the Oracle DB."""
        if not ORACLE_AVAILABLE:
            return None

        try:
            FDALabel_USER = current_app.config['FDALABEL_DB_USER']
            FDALabel_PSW = current_app.config['FDALABEL_DB_PASSWORD']
            dsnStr = oracledb.makedsn(current_app.config['FDALABEL_DB_HOST'],current_app.config['FDALABEL_DB_PORT'],current_app.config['FDALABEL_DB_SERVICE'])
            
            if not FDALabel_PSW:
                # Debug info (don't log sensitive info in prod, but helpful for setup)
                # print("FDALabel DB: No password found in config.")
                return None

            connection = oracledb.connect(user=FDALabel_USER, password=FDALabel_PSW, dsn=dsnStr)
            
            return connection
        except Exception as e:
            # print(f"FDALabel DB Connection Failed: {e}")
            return None

    @classmethod
    def check_connectivity(cls):
        """Checks if the internal DB is accessible. Caches the result."""
        if cls._is_connected is not None:
            return cls._is_connected

        conn = cls.get_connection()
        if conn:
            cls._is_connected = True
            print("[SUCCESS] FDALabel Internal Database connected successfully.")
            conn.close()
        else:
            cls._is_connected = False
            # Detailed debug info for fallback
            host = current_app.config.get('FDALABEL_DB_HOST')
            port = current_app.config.get('FDALABEL_DB_PORT')
            service = current_app.config.get('FDALABEL_DB_SERVICE')
            user = current_app.config.get('FDALABEL_DB_USER')
            has_pwd = bool(current_app.config.get('FDALABEL_DB_PASSWORD'))
            
            print(f"[ERROR] this database cannot be connected. Falling back to OpenFDA search.")
            # print(f"   [Debug Info] Host: {host}, Port: {port}, Service: {service}, User: {user}, Password Set: {has_pwd}")
        
        return cls._is_connected

    @classmethod
    def search_labels(cls, query, skip=0, limit=100000):
        """
        Searches the internal DB for labels matching the query.
        Returns a list of dictionaries formatted like OpenFDA results.
        """
        if not cls.check_connectivity():
            return []

        conn = cls.get_connection()
        if not conn:
            return []

        cursor = conn.cursor()
        results = []

        try:
            # Flexible search on Multiple Fields
            # Note: Oracle LIKE is case-sensitive by default, usually. Using UPPER/LOWER helps.
            # Using simple bound variables to prevent injection.
            # OFFSET-FETCH requires Oracle 12c+
            sql = """
                SELECT 
                    SET_ID,
                    PRODUCT_NAMES, 
                    PRODUCT_NORMD_GENERIC_NAMES,
                    AUTHOR_ORG_NORMD_NAME,  
                    MARKET_CATEGORIES,
                    APPR_NUM,
                    NDC_CODES,
                    EFF_TIME
                FROM druglabel.DGV_SUM_SPL
                WHERE 
                    UPPER(TITLE) LIKE UPPER(:q) OR
                    UPPER(PRODUCT_NAMES) LIKE UPPER(:q) OR
                    UPPER(PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:q) OR
                    NDC_CODES LIKE :q_exact OR
                    SET_ID = :q_exact_id
                OFFSET :skip ROWS FETCH NEXT :limit ROWS ONLY
            """
            
            search_pattern = f"%{query}%"
            
            cursor.execute(sql, {
                "q": search_pattern, 
                "q_exact": query, # NDC often searched exactly or prefix, but simple match for now
                "q_exact_id": query,
                "skip": skip,
                "limit": limit
            })

            rows = cursor.fetchall()

            for row in rows:
                # Map Oracle Row to OpenFDA-like structure
                # row structure: 0:TITLE, 1:PROD_NAMES, 2:GEN_NAMES, 3:NDCs, 4:SET_ID, 5:SPL_ID
                
                # Helper to split semi-colon separated strings into lists (common in these DBs)
                brand_names = row[1].split(';') if row[1] else []
                generic_names = row[2].split(';') if row[2] else []
                manufacturer = row[3]
                market_category = row[4]
                appl_num = row[5]
                ndc_codes = row[6]
                effective_time = row[7]


                item = {
                    'set_id': row[0],
                    'brand_name':', '.join(brand_names),
                    'generic_name': ', '.join(generic_names),
                    'manufacturer_name': manufacturer,
                    'effective_time': effective_time,
                    'label_format': 'FDALabel',
                    'application_number': appl_num,
                    'market_category': market_category,
                    'ndc': ndc_codes
                }
                results.append(item)

        except Exception as e:
            print(f"Error querying FDALabel DB: {e}")
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()

        return results

    @classmethod
    def get_label_metadata(cls, set_id):
        """
        Fetches metadata for a single label by Set ID from the internal DB.
        """
        if not cls.check_connectivity():
            return None
            
        # Use existing search logic which handles exact SET_ID match
        results = cls.search_labels(set_id, limit=1)
        if results:
            return results[0]
        return None

    @classmethod
    def get_drug_info(cls, drug_name):
        """
        Returns basic info (NDA, Set ID, etc.) for a given drug name.
        Matches against PRODUCT_NAMES or PRODUCT_NORMD_GENERIC_NAMES.
        Sorts by EFFECTIVE_TIME DESC and returns the top 1.
        """
        if not cls.check_connectivity():
            return None

        conn = cls.get_connection()
        if not conn:
            return None

        cursor = conn.cursor()
        try:
            query = """
                SELECT 
                    s.SET_ID, 
                    s.APPR_NUM, 
                    s.PRODUCT_NAMES, 
                    s.PRODUCT_NORMD_GENERIC_NAMES, 
                    s.ACT_INGR_NAMES,
                    rld.RLD,
                    s.EFF_TIME
                FROM druglabel.DGV_SUM_SPL s
                LEFT JOIN druglabel.sum_spl_rld rld on rld.spl_id = s.spl_id
                WHERE (UPPER(s.PRODUCT_NAMES) LIKE UPPER(:dn) OR 
                       UPPER(s.PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:dn) OR 
                       UPPER(s.ACT_INGR_NAMES) LIKE UPPER(:dn))
                ORDER BY rld.RLD DESC, s.EFF_TIME DESC
                FETCH FIRST 1 ROWS ONLY
            """
            bind_val = f"{drug_name}"
            cursor.execute(query, {"dn": bind_val})
            row = cursor.fetchone()
            
            if not row: # try vague match
                bind_val = f"%{drug_name}%"
                cursor.execute(query, {"dn": bind_val})
                row = cursor.fetchone()    
                if not row: # if still no match, return False
                    return None

            # Map results
            data = {
                "set_id": row[0],
                "appr_num": row[1],
                "product_name": row[2],
                "generic_name": row[3],
                "active_ingredients": row[4],
                "is_RLD": row[5],
                "effective_date": row[6]
            }
            return data

        except Exception as e:
            print(f"Error in get_drug_info: {e}")
            return None
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()