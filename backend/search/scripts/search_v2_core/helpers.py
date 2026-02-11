# scripts/search_v2_core/helpers.py
import re
from html import unescape
from collections import defaultdict
from typing import Any, Dict, List, Optional

def clean_xml_content(content: Any) -> str:
    """
    Remove XML/HTML tags and clean up content for display.
    Preserves highlight markers (<b>, <mark>) if present.
    """
    if not content:
        return ""
    content = str(content)
    content = re.sub(r"<(?!/?(?:b|mark)\b)[^>]+>", " ", content)
    content = unescape(content)
    content = re.sub(r"\s+", " ", content).strip()
    return content

def lob_to_string_limited(value: Any, max_length: int = 5000) -> Optional[str]:
    """Convert LOB (or value) to cleaned string with length limit."""
    if value is None:
        return None
    try:
        if hasattr(value, "read"):
            content = value.read()
            if isinstance(content, bytes):
                content = content.decode("utf-8", errors="ignore")
            content = clean_xml_content(content)
        else:
            content = clean_xml_content(str(value))

        if len(content) > max_length:
            return content[:max_length] + "..."
        return content
    except Exception as e:
        return f"[Error reading LOB: {str(e)}]"

def convert_oracle_to_filtered_results(
    oracle_results: List[Dict[str, Any]],
    keywords: Optional[str] = None
) -> Dict[str, Dict[str, Any]]:
    """
    Convert Oracle search results to filtered_results format.
    Handles LOB objects, cleans XML content, and extracts context snippets.
    """
    filtered_results: Dict[str, Dict[str, Any]] = defaultdict(dict)
    visited = set()

    if not oracle_results:
        return filtered_results

    def extract_setid_from_link(spl_link: Optional[str]) -> Optional[str]:
        if not spl_link:
            return None
        match = re.search(r"setid=([a-f0-9-]{36})", spl_link, re.IGNORECASE)
        return match.group(1) if match else None

    def safe_get(d: Dict[str, Any], *keys: str) -> Any:
        for key in keys:
            val = d.get(key)
            if val is not None:
                return lob_to_string_limited(val) if hasattr(val, "read") else val
        return None

    for result in oracle_results:
        result_dict = {str(k).upper(): v for k, v in (result or {}).items()}

        set_id = safe_get(result_dict, "SET_ID", "SETID", "SPL_GUID", "SPLGUID")
        if not set_id:
            set_id = extract_setid_from_link(result_dict.get("SPL_LINK"))

        if not set_id or set_id in visited:
            continue

        has_section_code = result_dict.get("LOINC_CODE") or result_dict.get("SECTION_CODE")
        if has_section_code:
            section_title = safe_get(result_dict, "SECTION_TITLE", "TITLE")
            section_content = f"Detailed Evidence in {section_title} - TBD" if section_title else "Detailed Evidence - TBD"
        else:
            section_content = "Detailed Evidence - TBD"

        filtered_results[set_id] = {
            "set_id": set_id,
            "keywords": re.sub(r";\s*", "%7c", keywords) if keywords else "",
            "section_code": safe_get(result_dict, "LOINC_CODE", "SECTION_CODE", "SEC_CODE") or "",
            "similarity_score": 0,
            "section_content": section_content,
            "PRODUCT_NAMES": safe_get(result_dict, "PRODUCT_NAMES", "PRODUCTNAMES", "PRODUCT_TITLE", "DRUG NAME (BRAND - GENERIC)"),
            "GENERIC_NAMES": safe_get(result_dict, "PRODUCT_NORMD_GENERIC_NAMES", "GENERIC_NAMES", "PRODUCT_GENERIC_NAMES"),
            "COMPANY": safe_get(result_dict, "AUTHOR_ORG_NORMD_NAME", "COMPANY", "MANUFACTURER", "AUTHOR_ORG"),
            "APPR_NUM": safe_get(result_dict, "APPR_NUM", "APPROVAL_NUM", "APPLICATION_NUM"),
            "ACT_INGR_NAMES": safe_get(result_dict, "ACT_INGR_NAMES", "ACTIVE_INGREDIENTS", "INGREDIENTS"),
            "MARKET_CATEGORIES": safe_get(result_dict, "MARKET_CATEGORIES", "MARKETING_CATEGORIES", "APPLICATION_TYPE"),
            "DOCUMENT_TYPE": safe_get(result_dict, "DOCUMENT_TYPE", "DOC_TYPE", "LABEL_TYPE"),
            "Routes": safe_get(result_dict, "ROUTES_OF_ADMINISTRATION", "ROUTES", "ROUTE"),
            "DOSAGE_FORMS": safe_get(result_dict, "DOSAGE_FORMS", "DOSAGEFORMS", "FORMULATION"),
            "EPC": safe_get(result_dict, "EPC", "PHARMACOLOGIC_CLASS", "PHARM_CLASS"),
            "NDC_CODES": safe_get(result_dict, "NDC_CODES", "NDC", "PRODUCT_NDC"),
            "SPL_ID": safe_get(result_dict, "SPL_ID", "SPLID"),
            "REVISED_DATE": safe_get(result_dict, "REVISED_DATE", "REVISION_DATE"),
            "INITIAL_APPROVAL_YEAR": safe_get(result_dict, "INITIAL_APPROVAL_YEAR", "APPROVAL_YEAR"),
            "SPL_LINK": result_dict.get("SPL_LINK"),
            "SECTION_TITLE": safe_get(result_dict, "SECTION_TITLE", "TITLE"),
            "RLD": result_dict.get("RLD","No"),
        }

        visited.add(set_id)

    return filtered_results

def build_debug_stats(state) -> Dict[str, Any]:
    plan = state.retrieval.get("plan", {}) or {}
    results = state.retrieval.get("results", []) or []
    snippets = (state.evidence or {}).get("snippets", []) or []
    fallback = state.retrieval.get("fallback", {}) or {}

    set_ids = [r.get("SET_ID") for r in results if r.get("SET_ID")]

    return {
        "intent_type": (state.intent or {}).get("type"),
        "plan_type": plan.get("plan_type"),
        "sql_template_hint": plan.get("sql_template_hint"),
        "search_terms": plan.get("search_terms") or ([plan.get("search_term")] if plan.get("search_term") else []),
        "content_query": plan.get("content_query") or plan.get("content_term") or "",
        "section_loinc_codes": plan.get("section_loinc_codes") or [],
        "filters": plan.get("filters") or {},
        "limit": plan.get("limit"),

        "db_rows_returned": len(results),
        "unique_set_ids_returned": len(set(set_ids)),
        "snippets_returned": len(snippets),
        "sections_fetched": sorted({s.get("loinc_code") for s in snippets if s.get("loinc_code")}),

        "used_ingredient_fallback": bool(fallback.get("ingredient_tried")),
        "db_error": state.retrieval.get("error"),
        "agent_flow": state.agent_flow,
    }
