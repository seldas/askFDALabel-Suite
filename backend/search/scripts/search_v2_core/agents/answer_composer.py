# scripts/search_v2_core/agents/answer_composer.py

from __future__ import annotations

from typing import Dict, List, Any

from ..log import logger
from ..llm import safe_llm_call
from ..config import client

try:
    from search.scripts.prompt_search_v2 import ANSWER_COMPOSER_PROMPT
except ImportError:
    from prompt_search_v2 import ANSWER_COMPOSER_PROMPT


# -------------------------
# Public helper (for streaming endpoint)
# -------------------------
def build_answer_messages(state) -> List[Dict[str, str]]:
    """
    Build the exact messages used to generate the final answer.
    Useful for /api/search_agentic_stream so you can stream tokens.
    """
    user_query = (state.conversation or {}).get("user_query", "") or ""
    evidence_str = build_evidence_string(state)

    prompt = (
        ANSWER_COMPOSER_PROMPT
        .replace("{user_query}", user_query)
        .replace("{evidence}", evidence_str)
    )
    return [{"role": "system", "content": prompt}]


def user_wants_non_rld(query: str) -> bool:
    """
    Check if the user explicitly wants to consider non-RLD labeling.
    """
    q = (query or "").lower()
    keywords = [
        "generic", "non-rld", "all labels", "every label", "any label",
        "including non-rld", "non rld", "not rld"
    ]
    return any(k in q for k in keywords)


def build_evidence_string(state) -> str:
    """
    Prefer fetched section snippets; otherwise fall back to top metadata rows.
    Keep it short-ish so the answer model doesn't get flooded.

    NEW: If RLD labels exist, prioritize them unless the user explicitly asked for non-RLD.
    """
    snippets = (state.evidence or {}).get("snippets") or []
    results = (state.retrieval or {}).get("results") or []
    user_query = (state.conversation or {}).get("user_query", "")

    wants_non_rld = user_wants_non_rld(user_query)

    # 1) Section snippets (preferred for QA)
    if snippets:
        # Filter for RLD if any exist and user didn't ask for non-RLD
        has_rld = any(str(s.get("rld") or s.get("RLD") or "").lower() == "yes" for s in snippets)
        
        filtered_snippets = snippets
        if has_rld and not wants_non_rld:
            filtered_snippets = [s for s in snippets if str(s.get("rld") or s.get("RLD") or "").lower() == "yes"]
            if len(filtered_snippets) < len(snippets):
                state.trace_log.append(f"Answer Composer: Filtered {len(snippets)} snippets down to {len(filtered_snippets)} RLD-only snippets.")

        out = []
        for s in filtered_snippets[:8]:
            product = s.get("product") or "-"
            set_id = s.get("set_id") or "-"
            loinc = s.get("loinc_code") or ""
            title = s.get("section_title") or ""
            header_bits = [b for b in [title, (f"LOINC {loinc}" if loinc else None)] if b]
            header = f"{' | '.join(header_bits)}" if header_bits else "Section"

            text = (s.get("text") or "").strip()
            if not text:
                text = "[Empty / not found]"

            out.append(
                f"Product: {product}\n"
                f"Set ID: {set_id}\n"
                f"{header}:\n"
                f"{text}\n"
            )
        return "\n\n".join(out).strip()

    # 2) Metadata fallback (if evidence fetcher didn't run / no sections found)
    if results:
        # Filter for RLD if any exist and user didn't ask for non-RLD
        has_rld = any(str(r.get("RLD") or r.get("rld") or "").lower() == "yes" for r in results)

        filtered_results = results
        if has_rld and not wants_non_rld:
            filtered_results = [r for r in results if str(r.get("RLD") or r.get("rld") or "").lower() == "yes"]
            if len(filtered_results) < len(results):
                state.trace_log.append(f"Answer Composer: Filtered {len(results)} results down to {len(filtered_results)} RLD-only results (metadata fallback).")

        out = []
        for r in filtered_results[:5]:
            # be tolerant to key variants
            product = r.get("PRODUCT_NAMES") or r.get("product_names") or "-"
            generic = (
                r.get("GENERIC_NAMES")
                or r.get("PRODUCT_NORMD_GENERIC_NAMES")
                or r.get("generic_names")
                or "-"
            )
            company = (
                r.get("COMPANY")
                or r.get("AUTHOR_ORG_NORMD_NAME")
                or r.get("company")
                or "-"
            )
            set_id = r.get("SET_ID") or r.get("set_id") or "-"
            out.append(
                f"Product: {product}\n"
                f"Generic: {generic}\n"
                f"Manufacturer: {company}\n"
                f"Set ID: {set_id}\n"
            )
        return "\n\n".join(out).strip()

    return "No results found."



def _compose_aggregate_text(state) -> str:
    agg = (state.retrieval or {}).get("aggregate") or {}
    ov = agg.get("overview", {}) or {}
    top_generics = (agg.get("top_generics") or [])[:10]
    top_companies = (agg.get("top_companies") or [])[:10]

    lines = []
    cq = agg.get("content_query") or ""
    if cq:
        lines.append(f"Content query: {cq}")
    if agg.get("section_loinc_codes"):
        lines.append(f"Section filter (LOINC): {', '.join(agg['section_loinc_codes'])}")

    lines.append("")
    lines.append(f"- Matching labels (distinct Set IDs): {ov.get('LABEL_COUNT', 0)}")
    lines.append(f"- Distinct generic-name strings: {ov.get('GENERIC_STR_COUNT', 0)}")
    lines.append(f"- Distinct product-name strings: {ov.get('PRODUCT_STR_COUNT', 0)}")
    lines.append(f"- Distinct companies: {ov.get('COMPANY_COUNT', 0)}")

    if top_generics:
        lines.append("\nTop generics (by distinct labels):")
        for r in top_generics:
            lines.append(f"  * {r.get('GENERIC_NAME')}: {r.get('LABEL_COUNT')} labels")

    if top_companies:
        lines.append("\nTop companies (by distinct labels):")
        for r in top_companies:
            lines.append(f"  * {r.get('COMPANY')}: {r.get('LABEL_COUNT')} labels")

    return "\n".join(lines).strip()


def run_answer_composer(state):
    logger.info("--- Running Answer Composer ---")

    # Ensure containers exist
    if state.answer is None:
        state.answer = {}
    if state.trace_log is None:
        state.trace_log = []

    intent_type = (state.intent or {}).get("type")

    # 1) Aggregate handled deterministically
    if (state.retrieval or {}).get("aggregate"):
        state.answer["response_text"] = _compose_aggregate_text(state)
        state.trace_log.append("Answer Composer: Returned aggregate summary (no full content fetch).")
        state.flags["next_step"] = "reasoning_generator"
        return

    # 2) Chitchat
    if intent_type == "chitchat":
        state.answer["response_text"] = (
            "Hello! I am AskFDALabel. I can help you search for drug labeling information. "
            "What would you like to look up?"
        )
        state.trace_log.append("Answer Composer: Handled chitchat.")
        state.flags["next_step"] = "reasoning_generator"
        return

    # 3) Clarification
    if intent_type == "clarification":
        q = (state.intent or {}).get("clarifying_question") or "Could you please provide more details?"
        state.answer["response_text"] = q
        state.trace_log.append(f"Answer Composer: Asked clarification: {q}")
        state.flags["next_step"] = "reasoning_generator"
        return

    # 4) Normal answer generation (non-streaming path)
    messages = build_answer_messages(state)

    success, response_text = safe_llm_call(client, messages, temperature=0.1, user=state.user)

    if success and response_text:
        state.answer["response_text"] = response_text
        state.trace_log.append("Answer Composer: Generated response from evidence.")
    else:
        state.answer["response_text"] = "I apologize, but I encountered an error generating the answer."
        state.trace_log.append("Answer Composer: Failed to generate response.")

    state.flags["next_step"] = "reasoning_generator"

