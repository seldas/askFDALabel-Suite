# scripts/search_v2_core/sql.py
from typing import Any, Dict, List

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
    def __init__(self, db_type="postgres"):
        from .config import (
            T_DGV_SUM_SPL, T_SPL_SEC, T_DGV_SUM_SPL_ACT_INGR, T_SUM_SPL_RLD
        )
        self.db_type = db_type
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
            self.bind_char = ":"
        else: # postgres
            self.rld_join = ""
            self.rld_sort = "CASE WHEN r.is_rld = 1 THEN 0 ELSE 1 END"
            self.base_cols = f"""
                r.spl_id as SPL_ID, r.set_id as SET_ID, r.product_names as PRODUCT_NAMES, r.generic_names as PRODUCT_NORMD_GENERIC_NAMES,
                r.manufacturer as AUTHOR_ORG_NORMD_NAME, r.appr_num as APPR_NUM, r.active_ingredients as ACT_INGR_NAMES, r.market_categories as MARKET_CATEGORIES,
                r.doc_type as DOCUMENT_TYPE, r.routes as ROUTES_OF_ADMINISTRATION, r.dosage_forms as DOSAGE_FORMS, r.epc as EPC,
                r.ndc_codes as NDC_CODES, r.revised_date as REVISED_DATE, r.initial_approval_year as INITIAL_APPROVAL_YEAR,
                (CASE WHEN r.is_rld = 1 THEN 'Yes' ELSE 'No' END) as RLD
            """
            self.content_cols = "s.loinc_code as LOINC_CODE, s.title as SECTION_TITLE, s.rank as TEXT_SCORE"
            self.bind_char = "%" # Use %(key)s

    def get_template(self, key):
        if self.db_type == "oracle":
            return self._oracle_templates()[key]
        else:
            return self._postgres_templates()[key]

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
            """,
            "aggregate_overview": f"""
                SELECT
                    COUNT(DISTINCT r.SET_ID) AS LABEL_COUNT,
                    COUNT(DISTINCT r.PRODUCT_NORMD_GENERIC_NAMES) AS GENERIC_STR_COUNT,
                    COUNT(DISTINCT r.PRODUCT_NAMES) AS PRODUCT_STR_COUNT,
                    COUNT(DISTINCT r.AUTHOR_ORG_NORMD_NAME) AS COMPANY_COUNT
                FROM {self.t_sum} r
                JOIN {self.t_sec} s ON r.SPL_ID = s.SPL_ID
                WHERE 1=1
                  {{name_clause}}
                  {{filters}}
                  AND CONTAINS(s.CONTENT_XML, :content_query, 1) > 0
                  {{section_clause}}
            """
        }

    def _postgres_templates(self):
        # Using ILIKE for Postgres case-insensitivity
        # rank() is used if FTS is configured, but here we assume simpler search
        # If we use websearch_to_tsquery or similar, we'd adjust rank.
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
                ) t
                LIMIT %(limit)s
            """,
            "content_search": f"""
                SELECT {OUTER_COLS_CONTENT}
                FROM (
                    SELECT 
                        {self.base_cols},
                        s.loinc_code as LOINC_CODE, 
                        s.title as SECTION_TITLE,
                        0 as TEXT_SCORE, -- Placeholder unless we use FTS rank
                        {self.rld_sort} AS RLD_SORT
                    FROM {self.t_sum} r
                    JOIN {self.t_sec} s ON r.spl_id = s.spl_id
                    WHERE 1=1
                      AND s.content_xml ILIKE %(content_query)s
                      {{section_clause}}
                      {{name_clause}}
                      {{filters}}
                    ORDER BY RLD_SORT ASC, r.revised_date DESC
                ) t
                LIMIT %(limit)s
            """,
            "search_by_set_id": f"""
                SELECT {self.base_cols}
                FROM {self.t_sum} r
                WHERE r.set_id = %(set_id)s
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
                      AND ai.substance_name ILIKE %(substance)s
                      {{filters}}
                    ORDER BY RLD_SORT ASC, r.revised_date DESC
                ) t
                LIMIT %(limit)s
            """,
            "aggregate_overview": f"""
                SELECT
                    COUNT(DISTINCT r.set_id) AS LABEL_COUNT,
                    COUNT(DISTINCT r.generic_names) AS GENERIC_STR_COUNT,
                    COUNT(DISTINCT r.product_names) AS PRODUCT_STR_COUNT,
                    COUNT(DISTINCT r.manufacturer) AS COMPANY_COUNT
                FROM {self.t_sum} r
                JOIN {self.t_sec} s ON r.spl_id = s.spl_id
                WHERE 1=1
                  {{name_clause}}
                  {{filters}}
                  AND s.content_xml ILIKE %(content_query)s
                  {{section_clause}}
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
    # Postgres doesn't strictly need this if using ILIKE, but good for safety
    return (term or "").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

def build_or_like_clause(column: str, values: List[str], bind_prefix: str, binds: Dict[str, Any]) -> str:
    from .config import DB_TYPE
    parts = []
    for i, v in enumerate(values or []):
        key = f"{bind_prefix}{i}"
        binds[key] = f"%{escape_like(v)}%"
        if DB_TYPE == "oracle":
            parts.append(f"UPPER({column}) LIKE UPPER(:{key}) ESCAPE '\\'")
        else: # postgres
            parts.append(f"{column} ILIKE %({key})s")
    return "(" + " OR ".join(parts) + ")" if parts else ""

def build_contains_section_clause(section_loinc_codes: List[str], binds: Dict[str, Any]) -> str:
    from .config import DB_TYPE
    if not section_loinc_codes: return ""
    
    if DB_TYPE == "oracle":
        placeholders = [f":sec_loinc_{i}" for i in range(len(section_loinc_codes))]
        for i, code in enumerate(section_loinc_codes):
            binds[f"sec_loinc_{i}"] = code
        return f" AND s.LOINC_CODE IN ({', '.join(placeholders)})"
    else: # postgres
        # Use = ANY(%(key)s) for array comparison
        binds["sec_loinc_list"] = list(section_loinc_codes)
        return " AND s.loinc_code = ANY(%(sec_loinc_list)s)"

def build_filters_clause(filters: Dict[str, Any], binds: Dict[str, Any]) -> str:
    from .config import DB_TYPE
    if not filters: return ""
    clauses = []
    company = filters.get("company")
    if company:
        binds["f_company"] = f"%{escape_like(company)}%"
        if DB_TYPE == "oracle":
            clauses.append(" AND UPPER(r.AUTHOR_ORG_NORMD_NAME) LIKE UPPER(:f_company) ESCAPE '\\'")
        else: # postgres
            clauses.append(" AND r.manufacturer ILIKE %(f_company)s")
    return "".join(clauses)
