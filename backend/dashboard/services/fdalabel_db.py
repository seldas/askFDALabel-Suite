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

    @classmethod
    def _chunk(cls, items, n=900):
        for i in range(0, len(items), n):
            yield items[i:i+n]

    @classmethod
    def get_label_core_by_set_ids(cls, set_ids):
        """
        Return mapping keyed by SET_ID:
        {
          set_id: { "spl_id": ..., "document_type": ..., "document_type_loinc_code": ... }
        }
        """
        if not set_ids or not cls.check_connectivity():
            return {}

        conn = cls.get_connection()
        if not conn:
            return {}

        cursor = conn.cursor()
        out = {}

        try:
            for chunk in cls._chunk(list(set_ids), n=900):
                binds = {f"sid{i}": v for i, v in enumerate(chunk)}
                in_clause = ", ".join([f":sid{i}" for i in range(len(chunk))])

                sql = f"""
                    SELECT
                        SET_ID,
                        SPL_ID,
                        DOCUMENT_TYPE,
                        DOCUMENT_TYPE_LOINC_CODE
                    FROM druglabel.DGV_SUM_SPL
                    WHERE SET_ID IN ({in_clause})
                """

                cursor.execute(sql, binds)
                for set_id, spl_id, doc_type, doc_loinc in cursor.fetchall():
                    out[str(set_id)] = {
                        "spl_id": spl_id,
                        "document_type": doc_type,
                        "document_type_loinc_code": doc_loinc
                    }

        except Exception as e:
            print(f"Error in get_label_core_by_set_ids: {e}")
        finally:
            try: cursor.close()
            except: pass
            try: conn.close()
            except: pass

        return out

    @classmethod
    def ingredient_role_breakdown_for_set_ids(cls, set_ids, substance_name):
        """
        For a given substance_name and a project set_ids list, returns:
        {
          "query": "...",
          "active_count": int,
          "inactive_count": int,
          "both_count": int,
          "not_found_count": int,
          "matches": { set_id: {"active": bool, "inactive": bool} }
        }
        """
        if not set_ids or not substance_name or not cls.check_connectivity():
            return {
                "query": substance_name,
                "active_count": 0,
                "inactive_count": 0,
                "both_count": 0,
                "not_found_count": len(set_ids or []),
                "matches": {}
            }

        # Step 1: set_id -> spl_id
        core = cls.get_label_core_by_set_ids(set_ids)
        spl_map = {sid: core[sid]["spl_id"] for sid in core if core[sid].get("spl_id")}

        if not spl_map:
            return {
                "query": substance_name,
                "active_count": 0,
                "inactive_count": 0,
                "both_count": 0,
                "not_found_count": len(set_ids),
                "matches": {}
            }

        # invert spl_id -> set_id
        spl_to_set = {}
        for sid, spl_id in spl_map.items():
            spl_to_set[str(spl_id)] = sid

        conn = cls.get_connection()
        if not conn:
            return {
                "query": substance_name,
                "active_count": 0,
                "inactive_count": 0,
                "both_count": 0,
                "not_found_count": len(set_ids),
                "matches": {}
            }

        cursor = conn.cursor()
        matches = {}  # set_id -> {"active": bool, "inactive": bool}

        try:
            spl_ids = list(spl_to_set.keys())

            for chunk in cls._chunk(spl_ids, n=900):
                binds = {f"sp{i}": v for i, v in enumerate(chunk)}
                in_clause = ", ".join([f":sp{i}" for i in range(len(chunk))])

                sql = f"""
                    SELECT
                        p.SPL_ID,
                        p.SUBSTANCE_NAME,
                        p.IS_ACTIVE
                    FROM druglabel.PROD_INGR p
                    WHERE p.SPL_ID IN ({in_clause})
                      AND UPPER(p.SUBSTANCE_NAME) = UPPER(:substance)
                """
                binds["substance"] = substance_name.strip()

                cursor.execute(sql, binds)
                for spl_id, sub_name, is_active in cursor.fetchall():
                    set_id = spl_to_set.get(str(spl_id))
                    if not set_id:
                        continue
                    if set_id not in matches:
                        matches[set_id] = {"active": False, "inactive": False}

                    # IS_ACTIVE: you said NUMBER(38,0); treat 1 as active
                    if int(is_active or 0) == 1:
                        matches[set_id]["active"] = True
                    else:
                        matches[set_id]["inactive"] = True

        except Exception as e:
            print(f"Error in ingredient_role_breakdown_for_set_ids: {e}")
        finally:
            try: cursor.close()
            except: pass
            try: conn.close()
            except: pass

        active_only = 0
        inactive_only = 0
        both = 0

        for sid, flags in matches.items():
            if flags["active"] and flags["inactive"]:
                both += 1
            elif flags["active"]:
                active_only += 1
            elif flags["inactive"]:
                inactive_only += 1

        not_found = len(set_ids) - len(matches)

        return {
            "query": substance_name,
            "active_count": active_only,
            "inactive_count": inactive_only,
            "both_count": both,
            "not_found_count": max(not_found, 0),
            "matches": matches
        }

    @classmethod
    def document_type_breakdown_for_set_ids(cls, set_ids):
        """
        Returns:
        {
          "raw": { "34391-3": 10, ... },
          "buckets": { "human_rx": 10, "human_otc": 3, "vaccine": 1, "animal_rx": 2, "animal_otc": 0, "other": 5, "unknown": 0 }
        }
        """
        core = cls.get_label_core_by_set_ids(set_ids)

        raw = {}
        for sid in set_ids:
            info = core.get(str(sid), {})
            code = info.get("document_type_loinc_code") or "UNKNOWN"
            code = str(code).strip() if code is not None else "UNKNOWN"
            raw[code] = raw.get(code, 0) + 1

        # Bucket mapping (based on your list)
        HUMAN_RX = {"34391-3", "45129-4"}
        HUMAN_OTC = {"34390-5"}
        VACCINE = {"53404-0", "53406-5"}  # vaccine label + vaccine bulk intermediate label
        ANIMAL_RX = {"50578-4", "50575-0", "50572-7", "50571-9"}  # include VFD animal types as Rx bucket
        ANIMAL_OTC = {"50577-6", "50576-8", "50574-3", "50573-5"}  # OTC animal types

        buckets = {
            "human_rx": 0,
            "human_otc": 0,
            "vaccine": 0,
            "animal_rx": 0,
            "animal_otc": 0,
            "other": 0,
            "unknown": 0
        }

        for code, cnt in raw.items():
            if code == "UNKNOWN":
                buckets["unknown"] += cnt
            elif code in HUMAN_RX:
                buckets["human_rx"] += cnt
            elif code in HUMAN_OTC:
                buckets["human_otc"] += cnt
            elif code in VACCINE:
                buckets["vaccine"] += cnt
            elif code in ANIMAL_RX:
                buckets["animal_rx"] += cnt
            elif code in ANIMAL_OTC:
                buckets["animal_otc"] += cnt
            else:
                buckets["other"] += cnt

        return {"raw": raw, "buckets": buckets}

@classmethod
def effective_time_map_for_set_ids(cls, set_ids):
    """
    Returns {set_id: eff_time} from internal DB.
    """
    if not cls.check_connectivity():
        return {}

    if not set_ids:
        return {}

    conn = cls.get_connection()
    if not conn:
        return {}

    cursor = conn.cursor()
    out = {}
    try:
        # Oracle has bind limits; chunk defensively
        CHUNK = 900
        for i in range(0, len(set_ids), CHUNK):
            chunk = set_ids[i:i+CHUNK]
            binds = ",".join([f":id{i+j}" for j in range(len(chunk))])
            sql = f"""
                SELECT SET_ID, EFF_TIME
                FROM druglabel.DGV_SUM_SPL
                WHERE SET_ID IN ({binds})
            """
            params = {f"id{i+j}": sid for j, sid in enumerate(chunk)}
            cursor.execute(sql, params)
            for sid, eff in cursor.fetchall():
                if sid and eff is not None:
                    out[str(sid)] = eff
    except Exception as e:
        print(f"Error in effective_time_map_for_set_ids: {e}")
    finally:
        try: cursor.close()
        except: pass
        try: conn.close()
        except: pass

    return out
