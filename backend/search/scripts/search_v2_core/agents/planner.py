# scripts/search_v2_core/agents/planner.py
import json
import re

from ..log import logger
from ..llm import safe_llm_call
from ..config import client
from ..heuristics import (
    extract_first_uuid, extract_spl_id, extract_ndc,
    infer_section_loinc_codes,
    is_count_query, is_compare_query, is_list_sections_query,
    user_explicitly_wants_ingredient_search
)

try:
    from search.scripts.prompt_search_v2 import PLANNER_PROMPT
except ImportError:
    from prompt_search_v2 import PLANNER_PROMPT


def apply_plan_overrides(state):
    q = state.conversation.get("user_query", "") or ""

    state.intent = state.intent or {}
    state.intent.setdefault("slots", {})
    slots = state.intent["slots"]

    state.retrieval = state.retrieval or {}
    state.retrieval.setdefault("plan", {})
    plan = state.retrieval["plan"]

    set_id = extract_first_uuid(q)
    spl_id = extract_spl_id(q)
    ndc = extract_ndc(q)
    section_codes = infer_section_loinc_codes(q)
    wants_list_sections = is_list_sections_query(q)

    # 1) Identifier overrides
    if set_id:
        slots["set_id"] = set_id
        plan.setdefault("filters", {})
        if wants_list_sections:
            state.intent["type"] = "list_sections"
            plan["plan_type"] = "metadata_only"
            plan["sql_template_hint"] = "list_sections_for_set_id"
        else:
            state.intent["type"] = "search"
            plan["plan_type"] = "metadata_only"
            plan["sql_template_hint"] = "search_by_set_id"
        return

    if spl_id:
        slots["spl_id"] = spl_id
        plan.setdefault("filters", {})
        state.intent["type"] = "search"
        plan["plan_type"] = "metadata_only"
        plan["sql_template_hint"] = "search_by_spl_id"
        return

    if ndc:
        slots["ndc"] = ndc
        plan.setdefault("filters", {})
        state.intent["type"] = "search"
        plan["plan_type"] = "metadata_only"
        plan["sql_template_hint"] = "search_by_ndc"
        return

    # 2) Aggregate
    if is_count_query(q):
        state.intent["type"] = "aggregate"
        plan["plan_type"] = "aggregate"
        plan["sql_template_hint"] = "aggregate_overview"
        plan.setdefault("filters", {})
        if section_codes:
            plan["section_loinc_codes"] = section_codes

    # 3) Compare
    if is_compare_query(q):
        state.intent["type"] = "compare"
        plan["plan_type"] = "compare"
        plan["sql_template_hint"] = "compare_flow"

    # 4) Ingredient safety
    template = plan.get("sql_template_hint")
    intent_type = state.intent.get("type")
    plan_type = plan.get("plan_type")

    if (
        template in ("search_by_active_ingredient", "search_by_epc")
        and not user_explicitly_wants_ingredient_search(q)
        and intent_type not in ("aggregate", "compare", "list_sections")
        and plan_type not in ("aggregate", "compare")
    ):
        if plan.get("content_query") or plan.get("content_term"):
            plan["sql_template_hint"] = "content_search"
            plan["plan_type"] = "content_search"
        else:
            plan["sql_template_hint"] = "metadata_search"
            plan["plan_type"] = "metadata_only"

        state.trace_log.append(
            "Planner Overrides: Switched ingredient-based template to name-based template (default behavior)."
        )

    state.retrieval["plan"] = plan


def run_planner(state):
    logger.info("--- Running Planner ---")
    history = state.conversation.get("history") or []
    # keep only well-formed, non-empty messages
    clean_history = []
    for m in history:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            clean_history.append({"role": role, "content": content})

    MAX_HISTORY_MSGS = 50 
    history_text = json.dumps(clean_history[-MAX_HISTORY_MSGS:], ensure_ascii=False) if clean_history else "None"
    prompt = PLANNER_PROMPT.replace("{user_query}", state.conversation["user_query"]).replace("{history}", history_text)

    messages = [{"role": "system", "content": prompt}]
    success, response_text = safe_llm_call(client, messages, temperature=0.0)

    if not success:
        logger.error("Planner LLM call failed.")
        state.flags["next_step"] = "error"
        return

    try:
        clean_json = (response_text or "").strip()
        if "```json" in clean_json:
            m = re.search(r"```json\s*(.*?)\s*```", clean_json, re.DOTALL)
            clean_json = m.group(1) if m else clean_json
        elif "```" in clean_json:
            m = re.search(r"```\s*(.*?)\s*```", clean_json, re.DOTALL)
            clean_json = m.group(1) if m else clean_json

        plan_data = json.loads(clean_json)

        intent = plan_data.get("intent") or {}
        retrieval_plan = plan_data.get("retrieval") or {}

        legacy_slots = plan_data.get("slots")
        if legacy_slots and isinstance(legacy_slots, dict):
            intent_slots = intent.get("slots") or {}
            if not isinstance(intent_slots, dict):
                intent_slots = {}
            for k, v in legacy_slots.items():
                intent_slots.setdefault(k, v)
            intent["slots"] = intent_slots

        intent.setdefault("slots", {})
        retrieval_plan.setdefault("filters", {})

        state.intent = intent
        state.retrieval["plan"] = retrieval_plan

        pre_intent_type = state.intent.get("type")
        pre_plan_type = state.retrieval["plan"].get("plan_type")
        pre_template = state.retrieval["plan"].get("sql_template_hint")
        state.trace_log.append(
            f"Planner: LLM intent='{pre_intent_type}' plan_type='{pre_plan_type}' template_hint='{pre_template}'."
        )

        apply_plan_overrides(state)

        post_intent_type = state.intent.get("type")
        post_plan_type = state.retrieval["plan"].get("plan_type")
        post_template = state.retrieval["plan"].get("sql_template_hint")

        if (pre_intent_type, pre_plan_type, pre_template) != (post_intent_type, post_plan_type, post_template):
            state.trace_log.append(
                "Planner: Overrides applied -> "
                f"intent='{post_intent_type}', plan_type='{post_plan_type}', template_hint='{post_template}'."
            )
        else:
            state.trace_log.append("Planner: No overrides applied.")

        intent_type = state.intent.get("type", "search")

        if intent_type in ("chitchat", "clarification"):
            state.flags["next_step"] = "answer_composer"
        elif intent_type in ("search", "qa", "list_sections", "compare"):
            state.flags["next_step"] = "db_executor"
        elif intent_type == "aggregate":
            state.flags["next_step"] = "aggregate_executor"
        else:
            state.flags["next_step"] = "answer_composer"

    except Exception as e:
        logger.error(f"Error parsing planner response: {e}")
        state.flags["next_step"] = "error"

