# scripts/search_v2_core/sql.py
from typing import Any, Dict, List

from .config import (
    T_DGV_SUM_SPL, T_SPL_SEC, T_DGV_SUM_SPL_ACT_INGR, T_DGV_SUM_SPL_EPC
)

# Optional: allow config to define it, otherwise default to the literal table name.
try:
    from .config import T_SUM_SPL_RLD  # type: ignore
except Exception:
    T_SUM_SPL_RLD = "SUM_SPL_RLD"


# -----------------------------
# Shared snippets
# -----------------------------

# 1-row-per-SPL_ID RLD lookup (prevents join duplication even if SUM_SPL_RLD has multiple rows per SPL_ID)
RLD_LEFT_JOIN = f"""
    LEFT JOIN (
        SELECT
            SPL_ID,
            MAX(CASE WHEN UPPER(RLD) = 'YES' THEN 'Yes' ELSE NULL END) AS RLD
        FROM {T_SUM_SPL_RLD}
        GROUP BY SPL_ID
    ) rld ON r.SPL_ID = rld.SPL_ID
"""

# Sort: RLD='Yes' first
RLD_SORT_EXPR = "CASE WHEN rld.RLD = 'Yes' THEN 0 ELSE 1 END"

# Base columns we return to the API/UI
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

# Inner select columns (include joins/aliases)
BASE_SELECT_COLS = """
    r.SPL_ID, r.SET_ID, r.PRODUCT_NAMES, r.PRODUCT_NORMD_GENERIC_NAMES,
    r.AUTHOR_ORG_NORMD_NAME, r.APPR_NUM, r.ACT_INGR_NAMES, r.MARKET_CATEGORIES,
    r.DOCUMENT_TYPE, r.ROUTES_OF_ADMINISTRATION, r.DOSAGE_FORMS, r.EPC,
    r.NDC_CODES, r.REVISED_DATE, r.INITIAL_APPROVAL_YEAR,
    rld.RLD AS RLD
"""

CONTENT_EXTRA_SELECT_COLS = """
    s.LOINC_CODE, s.SECTION_TITLE,
    s.TEXT_SCORE
"""


# -----------------------------
# SQL Templates
# -----------------------------
SQL_TEMPLATES = {
    "metadata_search": f"""
        SELECT {OUTER_COLS_METADATA}
        FROM (
            SELECT DISTINCT
                {BASE_SELECT_COLS},
                {RLD_SORT_EXPR} AS RLD_SORT
            FROM {T_DGV_SUM_SPL} r
            {RLD_LEFT_JOIN}
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
                {BASE_SELECT_COLS},
                {CONTENT_EXTRA_SELECT_COLS},
                {RLD_SORT_EXPR} AS RLD_SORT
            FROM {T_DGV_SUM_SPL} r
            {RLD_LEFT_JOIN}
            JOIN (
                SELECT
                    s.SPL_ID,
                    s.LOINC_CODE,
                    s.TITLE AS SECTION_TITLE,
                    SCORE(1) AS TEXT_SCORE
                FROM {T_SPL_SEC} s
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
        SELECT DISTINCT
            {BASE_SELECT_COLS}
        FROM {T_DGV_SUM_SPL} r
        {RLD_LEFT_JOIN}
        WHERE r.SET_ID = :set_id
        ORDER BY {RLD_SORT_EXPR} ASC, r.REVISED_DATE DESC NULLS LAST
    """,

    "search_by_spl_id": f"""
        SELECT DISTINCT
            {BASE_SELECT_COLS}
        FROM {T_DGV_SUM_SPL} r
        {RLD_LEFT_JOIN}
        WHERE r.SPL_ID = :spl_id
        ORDER BY {RLD_SORT_EXPR} ASC, r.REVISED_DATE DESC NULLS LAST
    """,

    "search_by_ndc": f"""
        SELECT {OUTER_COLS_METADATA}
        FROM (
            SELECT DISTINCT
                {BASE_SELECT_COLS},
                {RLD_SORT_EXPR} AS RLD_SORT
            FROM {T_DGV_SUM_SPL} r
            {RLD_LEFT_JOIN}
            WHERE 1=1
              AND INSTR(UPPER(r.NDC_CODES), UPPER(:ndc)) > 0
              {{filters}}
            ORDER BY RLD_SORT ASC, r.REVISED_DATE DESC NULLS LAST
        )
        WHERE ROWNUM <= :limit
    """,

    "search_by_active_ingredient": f"""
        SELECT {OUTER_COLS_METADATA}
        FROM (
            SELECT DISTINCT
                {BASE_SELECT_COLS},
                {RLD_SORT_EXPR} AS RLD_SORT
            FROM {T_DGV_SUM_SPL} r
            {RLD_LEFT_JOIN}
            JOIN {T_DGV_SUM_SPL_ACT_INGR} ai ON r.SPL_ID = ai.SPL_ID
            WHERE 1=1
              AND UPPER(ai.SUBSTANCE_NAME) LIKE UPPER(:substance)
              {{filters}}
            ORDER BY RLD_SORT ASC, r.REVISED_DATE DESC NULLS LAST
        )
        WHERE ROWNUM <= :limit
    """,

    "search_by_epc": f"""
        SELECT {OUTER_COLS_METADATA}
        FROM (
            SELECT DISTINCT
                {BASE_SELECT_COLS},
                {RLD_SORT_EXPR} AS RLD_SORT
            FROM {T_DGV_SUM_SPL} r
            {RLD_LEFT_JOIN}
            JOIN {T_DGV_SUM_SPL_EPC} e ON r.SPL_ID = e.SPL_ID
            WHERE 1=1
              AND UPPER(e.EPC) LIKE UPPER(:epc)
              {{filters}}
            ORDER BY RLD_SORT ASC, r.REVISED_DATE DESC NULLS LAST
        )
        WHERE ROWNUM <= :limit
    """,

    "list_sections_for_set_id": f"""
        SELECT DISTINCT
            s.LOINC_CODE, s.TITLE, s.GUID, s.PARENT_SEC_GUID
        FROM {T_SPL_SEC} s
        JOIN {T_DGV_SUM_SPL} r ON r.SPL_ID = s.SPL_ID
        WHERE r.SET_ID = :set_id
        ORDER BY s.LOINC_CODE
    """,

    # Aggregates: unchanged (ordering doesn't matter; joining RLD adds overhead for no benefit)
    "aggregate_overview": f"""
        SELECT
            COUNT(DISTINCT r.SET_ID) AS LABEL_COUNT,
            COUNT(DISTINCT r.PRODUCT_NORMD_GENERIC_NAMES) AS GENERIC_STR_COUNT,
            COUNT(DISTINCT r.PRODUCT_NAMES) AS PRODUCT_STR_COUNT,
            COUNT(DISTINCT r.AUTHOR_ORG_NORMD_NAME) AS COMPANY_COUNT
        FROM {T_DGV_SUM_SPL} r
        JOIN (
            SELECT DISTINCT s.SPL_ID
            FROM {T_SPL_SEC} s
            WHERE 1=1
              AND CONTAINS(s.CONTENT_XML, :content_query, 1) > 0
              {{section_clause}}
        ) sx ON r.SPL_ID = sx.SPL_ID
        WHERE 1=1
          {{name_clause}}
          {{filters}}
    """,

    "aggregate_top_generics": f"""
        SELECT * FROM (
            SELECT
                r.PRODUCT_NORMD_GENERIC_NAMES AS GENERIC_NAME,
                COUNT(DISTINCT r.SET_ID) AS LABEL_COUNT
            FROM {T_DGV_SUM_SPL} r
            JOIN (
                SELECT DISTINCT s.SPL_ID
                FROM {T_SPL_SEC} s
                WHERE 1=1
                  AND CONTAINS(s.CONTENT_XML, :content_query, 1) > 0
                  {{section_clause}}
            ) sx ON r.SPL_ID = sx.SPL_ID
            WHERE 1=1
              {{name_clause}}
              {{filters}}
            GROUP BY r.PRODUCT_NORMD_GENERIC_NAMES
            ORDER BY LABEL_COUNT DESC
        ) WHERE ROWNUM <= :limit
    """,

    "aggregate_top_companies": f"""
        SELECT * FROM (
            SELECT
                r.AUTHOR_ORG_NORMD_NAME AS COMPANY,
                COUNT(DISTINCT r.SET_ID) AS LABEL_COUNT
            FROM {T_DGV_SUM_SPL} r
            JOIN (
                SELECT DISTINCT s.SPL_ID
                FROM {T_SPL_SEC} s
                WHERE 1=1
                  AND CONTAINS(s.CONTENT_XML, :content_query, 1) > 0
                  {{section_clause}}
            ) sx ON r.SPL_ID = sx.SPL_ID
            WHERE 1=1
              {{name_clause}}
              {{filters}}
            GROUP BY r.AUTHOR_ORG_NORMD_NAME
            ORDER BY LABEL_COUNT DESC
        ) WHERE ROWNUM <= :limit
    """,

    "content_search_by_active_ingredient": f"""
        SELECT {OUTER_COLS_CONTENT}
        FROM (
            SELECT DISTINCT
                {BASE_SELECT_COLS},
                {CONTENT_EXTRA_SELECT_COLS},
                {RLD_SORT_EXPR} AS RLD_SORT
            FROM {T_DGV_SUM_SPL} r
            {RLD_LEFT_JOIN}
            JOIN {T_DGV_SUM_SPL_ACT_INGR} ai ON r.SPL_ID = ai.SPL_ID
            JOIN (
                SELECT
                    s.SPL_ID,
                    s.LOINC_CODE,
                    s.TITLE AS SECTION_TITLE,
                    SCORE(1) AS TEXT_SCORE
                FROM {T_SPL_SEC} s
                WHERE 1=1
                  AND CONTAINS(s.CONTENT_XML, :content_query, 1) > 0
                  {{section_clause}}
            ) s ON r.SPL_ID = s.SPL_ID
            WHERE 1=1
              AND UPPER(ai.SUBSTANCE_NAME) LIKE UPPER(:substance)
              {{filters}}
            ORDER BY RLD_SORT ASC, s.TEXT_SCORE DESC, r.REVISED_DATE DESC NULLS LAST
        )
        WHERE ROWNUM <= :limit
    """,

    "content_search_global": f"""
        SELECT {OUTER_COLS_CONTENT}
        FROM (
            SELECT DISTINCT
                {BASE_SELECT_COLS},
                {CONTENT_EXTRA_SELECT_COLS},
                {RLD_SORT_EXPR} AS RLD_SORT
            FROM {T_DGV_SUM_SPL} r
            {RLD_LEFT_JOIN}
            JOIN (
                SELECT
                    s.SPL_ID,
                    s.LOINC_CODE,
                    s.TITLE AS SECTION_TITLE,
                    SCORE(1) AS TEXT_SCORE
                FROM {T_SPL_SEC} s
                WHERE 1=1
                  AND CONTAINS(s.CONTENT_XML, :content_query, 1) > 0
                  {{section_clause}}
            ) s ON r.SPL_ID = s.SPL_ID
            WHERE 1=1
              {{filters}}
            ORDER BY RLD_SORT ASC, s.TEXT_SCORE DESC, r.REVISED_DATE DESC NULLS LAST
        )
        WHERE ROWNUM <= :limit
    """,
}


# -----------------------------
# SQL clause builders
# -----------------------------
def escape_like(term: str) -> str:
    # Escape %, _ and \ for LIKE ... ESCAPE '\'
    return (term or "").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def build_or_like_clause(column: str, values: List[str], bind_prefix: str, binds: Dict[str, Any]) -> str:
    parts = []
    for i, v in enumerate(values or []):
        key = f"{bind_prefix}{i}"
        binds[key] = f"%{escape_like(v)}%"
        parts.append(f"UPPER({column}) LIKE UPPER(:{key}) ESCAPE '\\'")
    if not parts:
        return ""
    return "(" + " OR ".join(parts) + ")"


def build_contains_section_clause(section_loinc_codes: List[str], binds: Dict[str, Any]) -> str:
    if not section_loinc_codes:
        return ""
    placeholders = []
    for i, code in enumerate(section_loinc_codes):
        k = f"sec_loinc_{i}"
        binds[k] = code
        placeholders.append(f":{k}")
    return f" AND s.LOINC_CODE IN ({', '.join(placeholders)})"


def build_filters_clause(filters: Dict[str, Any], binds: Dict[str, Any]) -> str:
    if not filters:
        return ""

    clauses = []

    company = filters.get("company")
    if company:
        binds["f_company"] = f"%{escape_like(company)}%"
        clauses.append(" AND UPPER(r.AUTHOR_ORG_NORMD_NAME) LIKE UPPER(:f_company) ESCAPE '\\'")

    mcats = filters.get("market_categories") or []
    if mcats:
        c = build_or_like_clause("r.MARKET_CATEGORIES", mcats, "f_mcat_", binds)
        if c:
            clauses.append(" AND " + c)

    doctypes = filters.get("document_types") or []
    if doctypes:
        c = build_or_like_clause("r.DOCUMENT_TYPE", doctypes, "f_doctype_", binds)
        if c:
            clauses.append(" AND " + c)

    routes = filters.get("routes") or []
    if routes:
        c = build_or_like_clause("r.ROUTES_OF_ADMINISTRATION", routes, "f_route_", binds)
        if c:
            clauses.append(" AND " + c)

    forms = filters.get("dosage_forms") or []
    if forms:
        c = build_or_like_clause("r.DOSAGE_FORMS", forms, "f_form_", binds)
        if c:
            clauses.append(" AND " + c)

    epc_terms = filters.get("epc_terms") or []
    if epc_terms:
        c = build_or_like_clause("r.EPC", epc_terms, "f_epc_", binds)
        if c:
            clauses.append(" AND " + c)

    y_min = filters.get("initial_approval_year_min")
    y_max = filters.get("initial_approval_year_max")
    if y_min is not None:
        binds["f_ymin"] = int(y_min)
        clauses.append(" AND r.INITIAL_APPROVAL_YEAR >= :f_ymin")
    if y_max is not None:
        binds["f_ymax"] = int(y_max)
        clauses.append(" AND r.INITIAL_APPROVAL_YEAR <= :f_ymax")

    rd_min = filters.get("revised_date_min")
    rd_max = filters.get("revised_date_max")
    if rd_min:
        binds["f_rdmin"] = rd_min
        clauses.append(" AND r.REVISED_DATE >= TO_DATE(:f_rdmin, 'YYYY-MM-DD')")
    if rd_max:
        binds["f_rdmax"] = rd_max
        clauses.append(" AND r.REVISED_DATE <= TO_DATE(:f_rdmax, 'YYYY-MM-DD')")

    # RLD Filter
    rld_filter = filters.get("rld")
    if rld_filter and str(rld_filter).toLowerCase() == 'yes':
        clauses.append(" AND rld.RLD = 'Yes'")

    return "".join(clauses)
