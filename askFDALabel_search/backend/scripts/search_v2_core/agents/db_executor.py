# scripts/search_v2_core/agents/db_executor.py
from typing import Any, Dict, List, Tuple
import re

from ..log import logger
from ..config import get_db_connection
from ..binds import prune_unused_binds
from ..heuristics import infer_section_loinc_codes
from ..sql import (
    SQL_TEMPLATES,
    escape_like,
    build_filters_clause,
    build_contains_section_clause,
)

# LOINC: Indications & Usage (PLR)
INDICATIONS_LOINC = "34067-9"


def _is_condition_discovery_query(q: str) -> bool:
    """
    Heuristic for "drugs that treat X / used for X" style queries.
    These should default to global content search (not name-based).
    """
    s = (q or "").lower()
    return bool(
        re.search(
            r"\b(treat|treats|treatment|treated|indicat(ed|ion|ions)|used\s+for|for)\b",
            s,
        )
    )


def _coerce_limit(v: Any, default: int = 100, max_limit: int = 200) -> int:
    try:
        n = int(v)
    except Exception:
        n = default
    return max(1, min(n, max_limit))


def _build_name_clause(search_terms: List[str], binds: Dict[str, Any]) -> str:
    """
    Name clause matches product OR normalized generic.
    """
    if not search_terms:
        return ""

    or_blocks = []
    for i, term in enumerate(search_terms):
        if not term:
            continue
        k = f"q{i}"
        binds[k] = f"%{escape_like(term)}%"
        or_blocks.append(
            f"(UPPER(r.PRODUCT_NAMES) LIKE UPPER(:{k}) ESCAPE '\\' "
            f" OR UPPER(r.PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:{k}) ESCAPE '\\')"
        )

    if not or_blocks:
        return ""
    return " AND (" + " OR ".join(or_blocks) + ")"


def _format_sql(template_key: str, sql_template: str, name_clause: str, filters_clause: str, section_clause: str) -> str:
    # Safe to pass extras; only missing placeholders would error.
    return sql_template.format(
        name_clause=name_clause,
        filters=filters_clause,
        section_clause=section_clause,
    )


def _execute_sql(formatted_sql: str, binds: Dict[str, Any]) -> List[Dict[str, Any]]:
    con = None
    try:
        con = get_db_connection()
        cursor = con.cursor()

        logger.debug(f"Executing SQL:\n{formatted_sql}\nBinds: {binds}")
        cursor.execute(formatted_sql, binds)

        columns = [col[0] for col in cursor.description]
        cursor.rowfactory = lambda *args: dict(zip(columns, args))
        return cursor.fetchall()
    finally:
        if con:
            con.close()


def run_db_executor(state):
    logger.info("--- Running DB Executor ---")

    plan = (state.retrieval or {}).get("plan", {}) or {}
    intent = state.intent or {}
    slots = intent.get("slots", {}) or {}

    user_q = (state.conversation or {}).get("user_query", "") or ""

    template_key = (plan.get("sql_template_hint") or "").strip() or None

    # Normalize search terms
    search_terms = plan.get("search_terms") or []
    if not search_terms and plan.get("search_term"):
        search_terms = [plan.get("search_term")]

    content_query = (plan.get("content_query") or plan.get("content_term") or "").strip()

    # Section codes: plan overrides > heuristic inference
    section_loinc_codes = plan.get("section_loinc_codes") or infer_section_loinc_codes(user_q)

    filters = plan.get("filters") or {}

    limit = _coerce_limit(plan.get("limit", 100))

    # -----------------------------
    # Template selection & overrides
    # -----------------------------
    # 1) If planner asked for a template we don't have, choose a sensible default.
    if not template_key or template_key not in SQL_TEMPLATES:
        if content_query:
            # If no search_terms, prefer global content search.
            template_key = "content_search_global" if not search_terms else "content_search"
        else:
            template_key = "metadata_search"

    # 2) If the user query looks like "drugs that treat X", prefer global content search.
    #    This avoids wrongly using search_terms as drug-name filters.
    if content_query and _is_condition_discovery_query(user_q):
        if template_key in ("content_search", "metadata_search") and "content_search_global" in SQL_TEMPLATES:
            template_key = "content_search_global"

    # 3) Default to Indications section for condition-discovery content searches (unless user specified a section)
    if content_query and _is_condition_discovery_query(user_q):
        if not section_loinc_codes:
            section_loinc_codes = [INDICATIONS_LOINC]

    # -----------------------------
    # Build SQL + binds
    # -----------------------------
    sql_template = SQL_TEMPLATES[template_key]
    binds: Dict[str, Any] = {"limit": limit}

    name_clause = _build_name_clause(search_terms, binds)
    filters_clause = build_filters_clause(filters, binds)
    section_clause = build_contains_section_clause(section_loinc_codes, binds)

    # Bind content_query only if used by the template
    if ":content_query" in sql_template:
        binds["content_query"] = content_query or ""

    # Identifier binds
    if template_key == "search_by_set_id":
        binds["set_id"] = (slots.get("set_id") or "").strip()
    elif template_key == "search_by_spl_id":
        binds["spl_id"] = (slots.get("spl_id") or "").strip()
    elif template_key == "search_by_ndc":
        binds["ndc"] = (slots.get("ndc") or "").strip()

    # Ingredient/EPC binds
    if template_key in ("search_by_active_ingredient", "content_search_by_active_ingredient"):
        term = (plan.get("substance_name") or (search_terms[0] if search_terms else "") or "").strip()
        binds["substance"] = f"%{term}%"

    if template_key == "search_by_epc":
        term = (plan.get("epc_term") or (search_terms[0] if search_terms else "") or "").strip()
        binds["epc"] = f"%{escape_like(term)}%"

    formatted_sql = _format_sql(template_key, sql_template, name_clause, filters_clause, section_clause)
    binds = prune_unused_binds(formatted_sql, binds)

    state.retrieval["generated_sql"] = formatted_sql
    state.retrieval["template_used"] = template_key

    # -----------------------------
    # Execute (with fallback)
    # -----------------------------
    try:
        rows = _execute_sql(formatted_sql, binds)
        logger.info(f"DB returned {len(rows)} rows.")
        state.trace_log.append(f"DB Executor: Executed '{template_key}' and found {len(rows)} results.")

        # Fallback: if content_search returned 0 and we had a content_query,
        # retry with GLOBAL content search (drops name_clause filter).
        should_fallback_to_global = (
            len(rows) == 0
            and content_query
            and template_key == "content_search"
            and "content_search_global" in SQL_TEMPLATES
        )

        if should_fallback_to_global:
            fb_key = "content_search_global"
            fb_template = SQL_TEMPLATES[fb_key]

            fb_binds: Dict[str, Any] = {"limit": limit}
            fb_filters_clause = build_filters_clause(filters, fb_binds)
            fb_section_clause = build_contains_section_clause(section_loinc_codes, fb_binds)

            if ":content_query" in fb_template:
                fb_binds["content_query"] = content_query or ""

            fb_sql = _format_sql(fb_key, fb_template, name_clause="", filters_clause=fb_filters_clause, section_clause=fb_section_clause)
            fb_binds = prune_unused_binds(fb_sql, fb_binds)

            fb_rows = _execute_sql(fb_sql, fb_binds)

            state.trace_log.append(
                f"DB Executor: Fallback from 'content_search' -> 'content_search_global' (0 results). Now found {len(fb_rows)} results."
            )

            if fb_rows:
                rows = fb_rows
                state.retrieval["generated_sql"] = fb_sql
                state.retrieval["template_used"] = fb_key

        state.retrieval["results"] = rows
        state.flags["next_step"] = "postprocess"

    except Exception as e:
        logger.error(f"DB execution error: {e}")
        state.retrieval["error"] = str(e)
        state.trace_log.append(f"DB Executor: Error executing SQL: {str(e)}")
        state.flags["next_step"] = "postprocess"
