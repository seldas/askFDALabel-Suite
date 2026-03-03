# scripts/search_v2_core/agents/db_executor.py
from typing import Any, Dict, List, Tuple
import re

from ..log import logger
from ..config import get_db_connection, get_db_type
from ..binds import prune_unused_binds
from ..heuristics import infer_section_loinc_codes
from ..sql import (
    SQL_TEMPLATES,
    SQLManager,
    escape_like,
    build_filters_clause,
    build_contains_section_clause,
)

# LOINC: Indications & Usage (PLR)
INDICATIONS_LOINC = "34067-9"


def _is_condition_discovery_query(q: str) -> bool:
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


def _build_name_clause(search_terms: List[str], binds: Dict[str, Any], db_type: str) -> str:
    if not search_terms:
        return ""

    or_blocks = []
    for i, term in enumerate(search_terms):
        if not term: continue
        k = f"q{i}"
        binds[k] = f"%{escape_like(term)}%"
        
        if db_type == "oracle":
            or_blocks.append(
                f"(UPPER(r.PRODUCT_NAMES) LIKE UPPER(:{k}) ESCAPE '\\' "
                f" OR UPPER(r.PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:{k}) ESCAPE '\\')"
            )
        else:
            # SQLite (lowercase columns in sum_spl)
            or_blocks.append(
                f"(UPPER(r.product_names) LIKE UPPER(:{k}) "
                f" OR UPPER(r.generic_names) LIKE UPPER(:{k}))"
            )

    if not or_blocks: return ""
    return " AND (" + " OR ".join(or_blocks) + ")"


def _format_sql(template_key: str, sql_template: str, name_clause: str, filters_clause: str, section_clause: str) -> str:
    return sql_template.format(
        name_clause=name_clause,
        filters=filters_clause,
        section_clause=section_clause,
    )


def run_db_executor(state):
    logger.info("--- Running DB Executor ---")

    # 1. Establish Connection FIRST to determine active DB_TYPE
    con = None
    try:
        con = get_db_connection()
        # Once connected, config.DB_TYPE is updated or we can infer from type(con)
        import sqlite3
        active_db_type = "sqlite" if isinstance(con, sqlite3.Connection) else "oracle"
        logger.info(f"Using database dialect: {active_db_type}")
        
        # Initialize SQL manager for this dialect
        manager = SQLManager(active_db_type)
        
        cursor = con.cursor()

        # 2. Get Search Plan
        plan = (state.retrieval or {}).get("plan", {}) or {}
        intent = state.intent or {}
        slots = intent.get("slots", {}) or {}
        user_q = (state.conversation or {}).get("user_query", "") or ""

        template_key = (plan.get("sql_template_hint") or "").strip() or None
        search_terms = plan.get("search_terms") or []
        if not search_terms and plan.get("search_term"):
            search_terms = [plan.get("search_term")]

        content_query = (plan.get("content_query") or plan.get("content_term") or "").strip()
        section_loinc_codes = plan.get("section_loinc_codes") or infer_section_loinc_codes(user_q)
        filters = plan.get("filters") or {}
        limit = _coerce_limit(plan.get("limit", 100))

        # 3. Resolve Template
        if not template_key or template_key not in SQL_TEMPLATES:
            template_key = "content_search_global" if (content_query and not search_terms) else ("content_search" if content_query else "metadata_search")

        if content_query and _is_condition_discovery_query(user_q):
            if template_key in ("content_search", "metadata_search"):
                template_key = "content_search_global"
            if not section_loinc_codes:
                section_loinc_codes = [INDICATIONS_LOINC]

        sql_template = manager.get_template(template_key)
        binds: Dict[str, Any] = {"limit": limit}

        name_clause = _build_name_clause(search_terms, binds, active_db_type)
        from ..sql import build_filters_clause, build_contains_section_clause # Use dynamic imports to ensure correct DB_TYPE check
        filters_clause = build_filters_clause(filters, binds)
        section_clause = build_contains_section_clause(section_loinc_codes, binds)

        if ":content_query" in sql_template:
            binds["content_query"] = content_query or ""

        # Identifier binds
        if template_key == "search_by_set_id":
            binds["set_id"] = (slots.get("set_id") or "").strip()
        elif template_key == "search_by_spl_id":
            binds["spl_id"] = (slots.get("spl_id") or "").strip()
        elif template_key == "search_by_ndc":
            binds["ndc"] = (slots.get("ndc") or "").strip()

        if template_key in ("search_by_active_ingredient", "content_search_by_active_ingredient"):
            term = (plan.get("substance_name") or (search_terms[0] if search_terms else "") or "").strip()
            binds["substance"] = f"%{term}%"

        formatted_sql = _format_sql(template_key, sql_template, name_clause, filters_clause, section_clause)
        binds = prune_unused_binds(formatted_sql, binds)

        state.retrieval["generated_sql"] = formatted_sql
        state.retrieval["template_used"] = template_key

        # 4. Execute
        cursor.execute(formatted_sql, binds)
        
        # Results to Dict
        if hasattr(cursor, 'description') and cursor.description:
            columns = [col[0].upper() for col in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        else:
            rows = []

        logger.info(f"DB returned {len(rows)} rows.")
        state.retrieval["results"] = rows
        state.flags["next_step"] = "postprocess"

    except Exception as e:
        logger.error(f"DB execution error: {e}")
        state.retrieval["error"] = str(e)
        state.flags["next_step"] = "postprocess"
    finally:
        if con:
            con.close()
