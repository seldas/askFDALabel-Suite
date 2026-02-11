# scripts/search_v2_core/agents/aggregate_executor.py
from typing import Any, Dict, List

from ..log import logger
from ..config import get_db_connection
from ..binds import prune_unused_binds
from ..heuristics import infer_section_loinc_codes
from ..sql import SQL_TEMPLATES, escape_like, build_filters_clause, build_contains_section_clause

def run_aggregate_executor(state):
    logger.info("--- Running Aggregate Executor ---")
    plan = state.retrieval.get("plan", {}) or {}

    search_terms = plan.get("search_terms") or ([] if not plan.get("search_term") else [plan.get("search_term")])
    content_query = plan.get("content_query") or plan.get("content_term") or ""
    section_loinc_codes = plan.get("section_loinc_codes") or infer_section_loinc_codes(state.conversation["user_query"])
    filters = plan.get("filters") or {}

    top_n = 10
    agg = plan.get("aggregation") or {}
    if agg.get("top_n"):
        try:
            top_n = int(agg["top_n"])
        except Exception:
            top_n = 10
    top_n = max(1, min(top_n, 50))

    binds: Dict[str, Any] = {"limit": top_n, "content_query": content_query}

    name_clause = ""
    if search_terms:
        or_blocks = []
        for i, term in enumerate(search_terms):
            k = f"q{i}"
            binds[k] = f"%{escape_like(term)}%"
            or_blocks.append(
                f"(UPPER(r.PRODUCT_NAMES) LIKE UPPER(:{k}) ESCAPE '\\' "
                f" OR UPPER(r.PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:{k}) ESCAPE '\\')"
            )
        name_clause = " AND (" + " OR ".join(or_blocks) + ")"

    filters_clause = build_filters_clause(filters, binds)
    section_clause = build_contains_section_clause(section_loinc_codes, binds)

    con = None
    try:
        con = get_db_connection()
        cursor = con.cursor()

        def run_tpl(key: str) -> List[Dict[str, Any]]:
            sql = SQL_TEMPLATES[key].format(
                name_clause=name_clause,
                filters=filters_clause,
                section_clause=section_clause
            )
            local_binds = prune_unused_binds(sql, dict(binds))
            cursor.execute(sql, local_binds)
            cols = [c[0] for c in cursor.description]
            return [dict(zip(cols, row)) for row in cursor.fetchall()]

        overview = run_tpl("aggregate_overview")
        top_generics = run_tpl("aggregate_top_generics")
        top_companies = run_tpl("aggregate_top_companies")

        state.retrieval["aggregate"] = {
            "overview": overview[0] if overview else {},
            "top_generics": top_generics,
            "top_companies": top_companies,
            "content_query": content_query,
            "section_loinc_codes": section_loinc_codes,
            "filters": filters,
        }
        state.trace_log.append("Aggregate Executor: Computed overview + top generics + top companies.")
        state.flags["next_step"] = "answer_composer"

    except Exception as e:
        logger.error(f"Aggregate execution error: {e}")
        state.retrieval["error"] = str(e)
        state.trace_log.append(f"Aggregate Executor: Error: {str(e)}")
        state.flags["next_step"] = "answer_composer"
    finally:
        if con:
            con.close()
