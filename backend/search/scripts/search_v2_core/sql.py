# scripts/search_v2_core/sql.py
from typing import Any, Dict, List
from .config import DB_TYPE

# -----------------------------
# Shared snippets
# -----------------------------

OUTER_COLS_METADATA = """
    SPL_ID, SET_ID, PRODUCT_NAMES, PRODUCT_NORMD_GENERIC_NAMES,
    AUTHOR_ORG_NORMD_NAME, APPR_NUM, ACT_INGR_NAMES, MARKET_CATEGORIES,
    DOCUMENT_TYPE, ROUTES_OF_ADMINISTRATION, DOSAGE_FORMS, EPC,
    NDC_CODES, REVISED_DATE, INITIAL_APPROVAL_YEAR,
    RLD
"""

OUTER_COLS_CONTENT = OUTER_COLS_METADATA + """,
    LOINC_CODE, SECTION_TITLE, TEXT_SCORE
"""

class SQLManager:
    def __init__(self, db_type="oracle"):
        from .config import (
            T_DGV_SUM_SPL, T_SPL_SEC, T_DGV_SUM_SPL_ACT_INGR, T_SUM_SPL_RLD
        )
        self.db_type = db_type
        
        # In SQLite mode, these names should NOT have schema prefixes if they are local tables
        if db_type == "sqlite":
            self.t_sum = "sum_spl"
            self.t_sec = "spl_sections"
            self.t_ai = "active_ingredients_map"
            self.t_rld = "sum_spl" # is_rld column
        else:
            self.t_sum = T_DGV_SUM_SPL
            self.t_sec = T_SPL_SEC
            self.t_ai = T_DGV_SUM_SPL_ACT_INGR
            self.t_rld = T_SUM_SPL_RLD

        # Dialect specific snippets
        if db_type == "oracle":
            self.rld_join = f"""
                LEFT JOIN (
                    SELECT
                        SPL_ID,
                        MAX(CASE WHEN UPPER(RLD) = 'YES' THEN 'Yes' ELSE NULL END) AS RLD
                    FROM {self.t_rld}
                    GROUP BY SPL_ID
                ) rld ON r.SPL_ID = rld.SPL_ID
            """
            self.rld_sort = "CASE WHEN rld.RLD = 'Yes' THEN 0 ELSE 1 END"
            self.base_cols = """
                r.SPL_ID, r.SET_ID, r.PRODUCT_NAMES, r.PRODUCT_NORMD_GENERIC_NAMES,
                r.AUTHOR_ORG_NORMD_NAME, r.APPR_NUM, r.ACT_INGR_NAMES, r.MARKET_CATEGORIES,
                r.DOCUMENT_TYPE, r.ROUTES_OF_ADMINISTRATION, r.DOSAGE_FORMS, r.EPC,
                r.NDC_CODES, r.REVISED_DATE, r.INITIAL_APPROVAL_YEAR,
                rld.RLD AS RLD
            """
            self.content_cols = "s.LOINC_CODE, s.SECTION_TITLE, s.TEXT_SCORE"
        else:
            self.rld_join = ""
            self.rld_sort = "CASE WHEN r.is_rld = 1 THEN 0 ELSE 1 END"
            self.base_cols = """
                r.spl_id as SPL_ID, r.set_id as SET_ID, r.product_names as PRODUCT_NAMES, r.generic_names as PRODUCT_NORMD_GENERIC_NAMES,
                r.manufacturer as AUTHOR_ORG_NORMD_NAME, r.appr_num as APPR_NUM, r.active_ingredients as ACT_INGR_NAMES, r.market_categories as MARKET_CATEGORIES,
                r.doc_type as DOCUMENT_TYPE, r.routes as ROUTES_OF_ADMINISTRATION, r.dosage_forms as DOSAGE_FORMS, r.epc as EPC,
                r.ndc_codes as NDC_CODES, r.revised_date as REVISED_DATE, r.initial_approval_year as INITIAL_APPROVAL_YEAR,
                (CASE WHEN r.is_rld = 1 THEN 'Yes' ELSE 'No' END) as RLD
            """
            self.content_cols = "s.loinc_code as LOINC_CODE, s.title as SECTION_TITLE, s.rank as TEXT_SCORE"

    def get_template(self, key):
        if self.db_type == "oracle":
            return self._oracle_templates()[key]
        else:
            return self._sqlite_templates()[key]

    def _oracle_templates(self):
        return {
            "metadata_search": f"""
                SELECT {OUTER_COLS_METADATA}
                FROM (
                    SELECT DISTINCT
                        {self.base_cols},
                        {self.rld_sort} AS RLD_SORT
                    FROM {self.t_sum} r
                    {self.rld_join}
                    WHERE 1=1
                      {{name_clause}}
                      {{filters}}
                    ORDER BY RLD_SORT ASC, r.REVISED_DATE DESC NULLS LAST
                )
                WHERE ROWNUM <= :limit
            """,
            "content_search": f"""
                SELECT {OUTER_COLS_CONTENT}
                FROM (
                    SELECT DISTINCT
                        {self.base_cols},
                        {self.content_cols},
                        {self.rld_sort} AS RLD_SORT
                    FROM {self.t_sum} r
                    {self.rld_join}
                    JOIN (
                        SELECT
                            s.SPL_ID,
                            s.LOINC_CODE,
                            s.TITLE AS SECTION_TITLE,
                            SCORE(1) AS TEXT_SCORE
                        FROM {self.t_sec} s
                        WHERE 1=1
                          AND CONTAINS(s.CONTENT_XML, :content_query, 1) > 0
                          {{section_clause}}
                    ) s ON r.SPL_ID = s.SPL_ID
                    WHERE 1=1
                      {{name_clause}}
                      {{filters}}
                    ORDER BY RLD_SORT ASC, s.TEXT_SCORE DESC, r.REVISED_DATE DESC NULLS LAST
                )
                WHERE ROWNUM <= :limit
            """,
            "search_by_set_id": f"""
                SELECT DISTINCT {self.base_cols}
                FROM {self.t_sum} r
                {self.rld_join}
                WHERE r.SET_ID = :set_id
            """,
            "search_by_active_ingredient": f"""
                SELECT {OUTER_COLS_METADATA}
                FROM (
                    SELECT DISTINCT
                        {self.base_cols},
                        {self.rld_sort} AS RLD_SORT
                    FROM {self.t_sum} r
                    {self.rld_join}
                    JOIN {self.t_ai} ai ON r.SPL_ID = ai.SPL_ID
                    WHERE 1=1
                      AND UPPER(ai.SUBSTANCE_NAME) LIKE UPPER(:substance)
                      {{filters}}
                    ORDER BY RLD_SORT ASC, r.REVISED_DATE DESC NULLS LAST
                )
                WHERE ROWNUM <= :limit
            """
        }

    def _sqlite_templates(self):
        return {
            "metadata_search": f"""
                SELECT {OUTER_COLS_METADATA}
                FROM (
                    SELECT 
                        {self.base_cols},
                        {self.rld_sort} AS RLD_SORT
                    FROM {self.t_sum} r
                    WHERE 1=1
                      {{name_clause}}
                      {{filters}}
                    ORDER BY RLD_SORT ASC, r.revised_date DESC
                )
                LIMIT :limit
            """,
            "content_search": f"""
                SELECT {OUTER_COLS_CONTENT}
                FROM (
                    SELECT 
                        {self.base_cols},
                        {self.content_cols},
                        {self.rld_sort} AS RLD_SORT
                    FROM {self.t_sum} r
                    JOIN (
                        SELECT
                            s.spl_id,
                            s.loinc_code,
                            s.title,
                            s.rank
                        FROM spl_sections_search s
                        WHERE 1=1
                          AND s.content_text MATCH :content_query
                          {{section_clause}}
                    ) s ON r.spl_id = s.spl_id
                    WHERE 1=1
                      {{name_clause}}
                      {{filters}}
                    ORDER BY RLD_SORT ASC, s.rank ASC, r.revised_date DESC
                )
                LIMIT :limit
            """,
            "search_by_set_id": f"""
                SELECT {self.base_cols}
                FROM {self.t_sum} r
                WHERE r.set_id = :set_id
            """,
            "search_by_active_ingredient": f"""
                SELECT {OUTER_COLS_METADATA}
                FROM (
                    SELECT 
                        {self.base_cols},
                        {self.rld_sort} AS RLD_SORT
                    FROM {self.t_sum} r
                    JOIN {self.t_ai} ai ON r.spl_id = ai.spl_id
                    WHERE 1=1
                      AND UPPER(ai.substance_name) LIKE UPPER(:substance)
                      {{filters}}
                    ORDER BY RLD_SORT ASC, r.revised_date DESC
                )
                LIMIT :limit
            """
        }

def get_active_manager():
    from .config import DB_TYPE
    return SQLManager(DB_TYPE)

class SQLProxy(dict):
    def __getitem__(self, key):
        return get_active_manager().get_template(key)
    def get(self, key, default=None):
        try:
            return get_active_manager().get_template(key)
        except KeyError:
            return default

SQL_TEMPLATES = SQLProxy()

def escape_like(term: str) -> str:
    return (term or "").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

def build_or_like_clause(column: str, values: List[str], bind_prefix: str, binds: Dict[str, Any]) -> str:
    from .config import DB_TYPE
    parts = []
    for i, v in enumerate(values or []):
        key = f"{bind_prefix}{i}"
        binds[key] = f"%{escape_like(v)}%"
        if DB_TYPE == "oracle":
            parts.append(f"UPPER({column}) LIKE UPPER(:{key}) ESCAPE '\\'")
        else:
            parts.append(f"UPPER({column}) LIKE UPPER(:{key})")
    return "(" + " OR ".join(parts) + ")" if parts else ""

def build_contains_section_clause(section_loinc_codes: List[str], binds: Dict[str, Any]) -> str:
    from .config import DB_TYPE
    if not section_loinc_codes: return ""
    placeholders = [f":sec_loinc_{i}" for i in range(len(section_loinc_codes))]
    for i, code in enumerate(section_loinc_codes):
        binds[f"sec_loinc_{i}"] = code
    col = "s.LOINC_CODE" if DB_TYPE == "oracle" else "s.loinc_code"
    return f" AND {col} IN ({', '.join(placeholders)})"

def build_filters_clause(filters: Dict[str, Any], binds: Dict[str, Any]) -> str:
    from .config import DB_TYPE
    if not filters: return ""
    clauses = []
    company = filters.get("company")
    if company:
        binds["f_company"] = f"%{escape_like(company)}%"
        col = "r.AUTHOR_ORG_NORMD_NAME" if DB_TYPE == "oracle" else "r.manufacturer"
        if DB_TYPE == "oracle":
            clauses.append(f" AND UPPER({col}) LIKE UPPER(:f_company) ESCAPE '\\'")
        else:
            clauses.append(f" AND UPPER({col}) LIKE UPPER(:f_company)")
    return "".join(clauses)
