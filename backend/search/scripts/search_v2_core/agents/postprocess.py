# scripts/search_v2_core/agents/postprocess.py
from ..log import logger
from ..heuristics import (
    user_explicitly_wants_ingredient_search,
    detect_content_need,
    is_metadata_only_question,
    _merge_unique,
)

def run_postprocess(state):
    """
    Evaluates results and decides whether we need to fetch label section content.
    - Implements ingredient fallback when name search returns nothing.
    - Forces evidence fetch for AE/indication/interactions/etc.
    """
    logger.info("--- Running Postprocess ---")

    results = state.retrieval.get("results", []) or []
    plan = state.retrieval.get("plan", {}) or {}
    intent = state.intent or {}
    intent_type = intent.get("type", "search")
    user_q = state.conversation.get("user_query", "") or ""  # FIX: define early

    # -----------------------
    # No results: ingredient fallback
    # -----------------------
    if not results:
        fb = state.retrieval.setdefault("fallback", {})
        ingredient_tried = bool(fb.get("ingredient_tried"))

        search_terms = plan.get("search_terms") or ([plan.get("search_term")] if plan.get("search_term") else [])
        search_terms = [t for t in search_terms if t and isinstance(t, str)]

        current_template = plan.get("sql_template_hint")
        name_based_templates = {"metadata_search", "content_search"}

        if (
            search_terms
            and current_template in name_based_templates
            and not user_explicitly_wants_ingredient_search(user_q)
            and not ingredient_tried
        ):
            fb["ingredient_tried"] = True

            has_content_query = bool(plan.get("content_query") or plan.get("content_term"))
            if has_content_query:
                plan["sql_template_hint"] = "content_search_by_active_ingredient"
                plan["plan_type"] = "content_search"
            else:
                plan["sql_template_hint"] = "search_by_active_ingredient"
                plan["plan_type"] = "metadata_only"

            plan.setdefault("substance_name", search_terms[0])

            state.retrieval["plan"] = plan
            state.trace_log.append("Postprocess: No results; retrying using active-ingredient fallback.")
            state.flags["next_step"] = "db_executor"
            return

        state.trace_log.append("Postprocess: No results and no fallback applied; going to answer composer.")
        state.flags["next_step"] = "answer_composer"
        return

    # -----------------------
    # Results exist
    # -----------------------
    plan_type = plan.get("plan_type") or "metadata_only"

    if plan_type == "aggregate" or intent_type == "aggregate":
        state.trace_log.append("Postprocess: Aggregate plan; skipping evidence fetch.")
        state.flags["next_step"] = "answer_composer"
        return

    needs_evidence = plan.get("needs_evidence")
    if needs_evidence is None:
        needs_evidence = (plan_type in ["content_search", "section_content"]) or (intent_type in ["qa", "compare"])

    content_needed, inferred_loincs, reason = detect_content_need(user_q)

    if content_needed and not is_metadata_only_question(user_q):
        if not needs_evidence:
            state.trace_log.append(f"Postprocess: Forcing needs_evidence=True due to content-heavy question. Reason: {reason}")
        needs_evidence = True

        if inferred_loincs:
            plan["section_loinc_codes"] = _merge_unique(plan.get("section_loinc_codes"), inferred_loincs)
            intent.setdefault("slots", {})
            intent["slots"]["section_loinc_codes"] = _merge_unique(intent["slots"].get("section_loinc_codes"), inferred_loincs)
            state.trace_log.append(f"Postprocess: Inferred section_loinc_codes={plan['section_loinc_codes']} for evidence fetch.")

        if plan_type == "metadata_only":
            plan["plan_type"] = "section_content"
            state.trace_log.append("Postprocess: Upgraded plan_type metadata_only -> section_content due to QA detail need.")

        state.retrieval["plan"] = plan
        state.intent = intent

    if not needs_evidence:
        state.trace_log.append("Postprocess: Evidence fetch not needed; going to answer composer.")
        state.flags["next_step"] = "answer_composer"
        return

    state.trace_log.append("Postprocess: Evidence fetch needed; going to evidence_fetcher.")
    state.flags["next_step"] = "evidence_fetcher"
