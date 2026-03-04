# scripts/search_v2_core/agents/evidence_fetcher.py
from typing import Any, Dict, List, Optional, Tuple
import re

from ..log import logger
from ..config import get_db_connection, T_SPL_SEC
from ..helpers import lob_to_string_limited


# --- small utilities ---------------------------------------------------------

_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "with", "on", "at",
    "is", "are", "was", "were", "be", "been", "being", "as", "by", "from",
    "this", "that", "these", "those", "it", "its", "their", "they", "them",
    "patient", "patients", "recommended", "dosage", "dose", "section", "label",
    "stated", "administration", "dosage", "dosages"
}


def _tokenize_focus_terms(user_query: str, plan: Dict[str, Any]) -> List[str]:
    """
    Build a reasonable list of "focus terms" so we can:
    - read more text for QA
    - extract a relevant window (instead of always the first N chars)
    """
    focus: List[str] = []

    # planner sometimes includes these; keep backward compatible
    for k in ("content_terms", "content_query", "content_term", "search_term", "search_terms"):
        v = plan.get(k)
        if isinstance(v, str) and v.strip():
            focus.append(v.strip())
        elif isinstance(v, list):
            focus.extend([str(x).strip() for x in v if str(x).strip()])

    # add user_query tokens
    uq = (user_query or "").strip()
    if uq:
        words = re.findall(r"[A-Za-z0-9\.\-]+", uq)
        for w in words:
            wl = w.lower()
            if len(w) >= 5 and wl not in _STOPWORDS:
                focus.append(w)

    # add subsection references like "2.5"
    for m in re.findall(r"\b(\d+\.\d+)\b", uq):
        focus.append(m)

    # normalize + dedupe preserving order
    seen = set()
    out: List[str] = []
    for t in focus:
        tt = t.strip()
        if not tt:
            continue
        key = tt.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(tt)
    return out[:24]  # keep it bounded


def _looks_like_interaction_query(user_query: str) -> bool:
    q = (user_query or "").lower()
    if any(x in q for x in ["coadmin", "co-admin", "coadminister", "interaction", "inhibitor", "cyp3a4", "strong inhibitor"]):
        return True
    # common interaction-drug cue (non-exhaustive but helpful)
    if any(x in q for x in ["clarithromycin", "erythromycin", "itraconazole", "ketoconazole", "ritonavir", "cyclosporine"]):
        return True
    return False


def _extract_relevant_window(text: str, focus_terms: List[str], prefer_subsection: Optional[str], max_chars: int) -> Tuple[str, str]:
    """
    Return a trimmed chunk + a short note describing how it was selected.
    """
    if not text:
        return "", "empty"

    max_chars = max(200, int(max_chars or 0))

    # Try to jump to a subsection heading (e.g., "2.5") if requested or implied
    if prefer_subsection:
        # match start of line heading: "2.5", "2.5.", "2.5 "
        pat = re.compile(rf"(^|\n)\s*{re.escape(prefer_subsection)}(\s|\.|\-|:)", re.IGNORECASE)
        m = pat.search(text)
        if m:
            start = max(0, m.start())
            chunk = text[start:start + max_chars]
            return chunk, f"subsection:{prefer_subsection}"

    # Otherwise find the earliest occurrence of any focus term
    best_idx = None
    best_term = None
    lower = text.lower()
    for t in focus_terms:
        tl = t.lower()
        if len(tl) < 3:
            continue
        idx = lower.find(tl)
        if idx != -1 and (best_idx is None or idx < best_idx):
            best_idx = idx
            best_term = t

    if best_idx is not None:
        # window around match
        half = max_chars // 2
        start = max(0, best_idx - half)
        end = min(len(text), start + max_chars)
        chunk = text[start:end]
        return chunk, f"match:{best_term}"

    # fallback: beginning of the section
    return text[:max_chars], "prefix"


def _safe_list_unique(xs: List[str]) -> List[str]:
    seen = set()
    out = []
    for x in xs:
        if not x:
            continue
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


# --- main agent --------------------------------------------------------------


def run_evidence_fetcher(state):
    logger.info("--- Running Evidence Fetcher ---")

    # Ensure containers exist
    if not getattr(state, "evidence", None):
        state.evidence = {}
    if not getattr(state, "trace_log", None):
        state.trace_log = []
    if not getattr(state, "flags", None):
        state.flags = {}

    results = state.retrieval.get("results", []) or []
    plan = state.retrieval.get("plan", {}) or {}
    intent_slots = (state.intent or {}).get("slots", {}) or {}
    intent_type = (state.intent or {}).get("type") or "search"
    user_query = (state.conversation or {}).get("user_query", "") or ""

    # ----------------------------------------------------------------------------
    # NEW Optimization: Limit labels processed for Evidence
    # If it's a QA query, we usually only need the top few results.
    # ----------------------------------------------------------------------------
    if intent_type == "qa" and len(results) > 5:
        logger.info(f"Evidence Fetcher: Truncating {len(results)} results to top 5 for QA.")
        results = results[:5]

    max_total_chars = int(plan.get("max_total_chars", 200000) or 200000)
    max_total_chars = max(10_000, min(max_total_chars, 400_000))  # sanity clamp

    evidence_limit = plan.get("evidence_limit", None)
    try:
        max_labels_soft = int(evidence_limit) if evidence_limit is not None else None
        if max_labels_soft is not None and max_labels_soft <= 0:
            max_labels_soft = None
    except Exception:
        max_labels_soft = None

    # Safety caps
    max_labels_hard = int(plan.get("max_labels_hard", 30) or 30)
    max_snippets_hard = int(plan.get("max_snippets_hard", 90) or 90)

    max_sections_per_label = int(plan.get("max_sections_per_label", 3) or 3)

    max_chars_default = int(plan.get("max_chars_per_section", 1500) or 1500)
    max_chars_for_qa = int(plan.get("max_chars_per_section_qa", 9000) or 9000)
    max_chars_window = int(plan.get("max_chars_window", 2200) or 2200)

    PER_SNIPPET_OVERHEAD = int(plan.get("per_snippet_overhead", 220) or 220)

    snippets: List[Dict[str, Any]] = []
    total_chars_used = 0
    labels_used = 0

    # Requested LOINCs
    requested_loincs = plan.get("section_loinc_codes") or intent_slots.get("section_loinc_codes") or []
    requested_loincs = _safe_list_unique([str(x).strip() for x in requested_loincs if str(x).strip()])

    if intent_type == "qa" and _looks_like_interaction_query(user_query):
        if "34073-7" not in requested_loincs:
            requested_loincs.append("34073-7")  # Drug Interactions
        requested_loincs = _safe_list_unique(requested_loincs)

    focus_terms = _tokenize_focus_terms(user_query, plan)

    prefer_subsection = None
    m_sub = re.search(r"\b(\d+\.\d+)\b", user_query or "")
    if m_sub:
        prefer_subsection = m_sub.group(1)

    con = None
    try:
        con = get_db_connection()
        cursor = con.cursor()

        content_xml_is_xmltype = None

        def fetch_all_label_sections(cursor, spl_id: Any, loincs: List[str]) -> Dict[str, List[Tuple[Any, Any, Any]]]:
            """
            Optimized: Fetch all requested LOINCs for a label in ONE database call.
            """
            nonlocal content_xml_is_xmltype
            if not loincs:
                return {}

            # Build IN clause safely
            loinc_placeholders = [f":l{i}" for i in range(len(loincs))]
            loinc_binds = {f"l{i}": code for i, code in enumerate(loincs)}
            binds = {"spl_id": spl_id, **loinc_binds}

            q_xml = f"""
                SELECT s.LOINC_CODE, s.TITLE,
                       XMLSERIALIZE(CONTENT s.CONTENT_XML AS CLOB) AS CONTENT_CLOB
                FROM {T_SPL_SEC} s
                WHERE s.SPL_ID = :spl_id AND s.LOINC_CODE IN ({", ".join(loinc_placeholders)})
            """
            q_raw = f"""
                SELECT s.LOINC_CODE, s.TITLE, s.CONTENT_XML
                FROM {T_SPL_SEC} s
                WHERE s.SPL_ID = :spl_id AND s.LOINC_CODE IN ({", ".join(loinc_placeholders)})
            """

            rows = []
            if content_xml_is_xmltype in (None, True):
                try:
                    cursor.execute(q_xml, binds)
                    rows = cursor.fetchall() or []
                    content_xml_is_xmltype = True
                except Exception:
                    if content_xml_is_xmltype is None:
                        content_xml_is_xmltype = False
                    else: raise

            if not content_xml_is_xmltype:
                cursor.execute(q_raw, binds)
                rows = cursor.fetchall() or []

            # Group by LOINC
            grouped = {}
            for row in rows:
                code = str(row[0])
                if code not in grouped: grouped[code] = []
                grouped[code].append(row)
            return grouped

        def budget_left() -> int:
            return max_total_chars - total_chars_used

        def should_stop() -> bool:
            if budget_left() <= 0:
                return True
            if max_labels_soft is not None and labels_used >= max_labels_soft:
                return True
            if labels_used >= max_labels_hard:
                return True
            if len(snippets) >= max_snippets_hard:
                return True
            return False

        content_found_count = 0
        missing_sections: List[str] = []

        for res in results:
            if should_stop():
                break

            set_id = res.get("SET_ID") or res.get("set_id")
            spl_id = res.get("SPL_ID") or res.get("spl_id")
            product = res.get("PRODUCT_NAMES") or res.get("product") or ""
            rld_val = res.get("RLD") or res.get("rld") or ""
            row_loinc = res.get("LOINC_CODE") or res.get("SECTION_CODE") or res.get("section_code")

            target_loincs = requested_loincs[:] if requested_loincs else ([row_loinc] if row_loinc else [])
            target_loincs = _safe_list_unique([str(x).strip() for x in target_loincs if str(x).strip()])
            target_loincs = target_loincs[:max_sections_per_label]

            labels_used += 1

            if not spl_id:
                txt = "[No SPL_ID available; unable to fetch section content.]"
                add_cost = len(txt) + PER_SNIPPET_OVERHEAD
                if total_chars_used + add_cost <= max_total_chars:
                    snippets.append({"set_id": set_id, "product": product, "rld": rld_val, "text": txt})
                    total_chars_used += add_cost
                continue

            if not target_loincs:
                txt = "[No section specified/inferred; section content not fetched.]"
                add_cost = len(txt) + PER_SNIPPET_OVERHEAD
                if total_chars_used + add_cost <= max_total_chars:
                    snippets.append({"set_id": set_id, "spl_id": spl_id, "product": product, "rld": rld_val, "text": txt})
                    total_chars_used += add_cost
                continue

            # FETCH ALL AT ONCE
            label_sections_data = fetch_all_label_sections(cursor, spl_id, target_loincs)

            for loinc in target_loincs:
                if should_stop():
                    break

                rows = label_sections_data.get(loinc, [])
                if not rows:
                    missing_sections.append(str(loinc))
                    txt = f"[Section not found or empty for LOINC {loinc}]"
                    add_cost = len(txt) + PER_SNIPPET_OVERHEAD
                    if total_chars_used + add_cost <= max_total_chars:
                        snippets.append({
                            "set_id": set_id, "spl_id": spl_id, "product": product, "rld": rld_val,
                            "loinc_code": loinc, "section_title": None, "text": txt
                        })
                        total_chars_used += add_cost
                    continue

                read_cap = max_chars_for_qa if intent_type == "qa" else max_chars_default
                read_cap = int(max(800, min(read_cap, budget_left() + 3000)))

                combined_parts: List[str] = []
                any_row_text = False
                titles_seen = set()

                for (loinc_code, title, content_val) in rows:
                    if not content_val: continue
                    raw_text = lob_to_string_limited(content_val, max_length=read_cap) or ""
                    raw_text = raw_text.strip()
                    if not raw_text: continue
                    any_row_text = True
                    tkey = (title or "").strip()
                    if tkey and tkey not in titles_seen:
                        titles_seen.add(tkey)
                        combined_parts.append(f"\n\n=== {tkey} (LOINC {loinc_code or loinc}) ===\n")
                    combined_parts.append(raw_text)
                    if sum(len(p) for p in combined_parts) > (read_cap * 2): break

                if not any_row_text:
                    missing_sections.append(str(loinc))
                    txt = f"[Section content empty for LOINC {loinc}]"
                    add_cost = len(txt) + PER_SNIPPET_OVERHEAD
                    if total_chars_used + add_cost <= max_total_chars:
                        snippets.append({
                            "set_id": set_id, "spl_id": spl_id, "product": product, "rld": rld_val,
                            "loinc_code": loinc, "section_title": rows[0][1] if rows else None, "text": txt
                        })
                        total_chars_used += add_cost
                    continue

                combined = "\n".join(combined_parts).strip()
                inferred_subsection = prefer_subsection
                if inferred_subsection is None:
                    m_ref = re.search(r"\(\s*(\d+\.\d+)\s*\)|\bsection\s+(\d+\.\d+)\b", combined, re.IGNORECASE)
                    if m_ref: inferred_subsection = m_ref.group(1) or m_ref.group(2)

                base_window = max_chars_window if intent_type == "qa" else max_chars_default
                header_stub = f"[{(rows[0][1] or 'Section')} | LOINC {rows[0][0] or loinc}] "
                remaining_for_text = budget_left() - (len(header_stub) + PER_SNIPPET_OVERHEAD)
                window_max = int(max(200, min(base_window, max(200, remaining_for_text))))

                window, window_reason = _extract_relevant_window(
                    combined, focus_terms=focus_terms, prefer_subsection=inferred_subsection, max_chars=window_max
                )

                header = header_stub
                snippet_text = header + (window or "")
                if total_chars_used + len(snippet_text) + PER_SNIPPET_OVERHEAD > max_total_chars:
                    allowed = budget_left() - (len(header) + PER_SNIPPET_OVERHEAD)
                    if allowed <= 0: break
                    snippet_text = header + (window[:allowed] if window else "")
                    window_reason = f"{window_reason},truncated"

                snippets.append({
                    "set_id": set_id, "spl_id": spl_id, "product": product, "rld": rld_val,
                    "loinc_code": rows[0][0] or loinc, "section_title": rows[0][1],
                    "window_reason": window_reason, "text": snippet_text
                })
                total_chars_used += len(snippet_text) + PER_SNIPPET_OVERHEAD
                content_found_count += 1

        state.evidence["snippets"] = snippets
        state.trace_log.append(
            f"Evidence Fetcher: Built {len(snippets)} snippet(s) across {labels_used} label(s), "
            f"chars_used~={total_chars_used}/{max_total_chars}."
        )

        if intent_type == "qa" and content_found_count == 0:
            suggested = requested_loincs[:] if requested_loincs else []
            for code in ["34068-7", "34073-7", "43685-7"]:
                if code not in suggested: suggested.append(code)
            state.flags["need_replan"] = True
            state.retrieval["replan_request"] = {"action": "fetch_more_sections", "section_loinc_codes": suggested[:3], "focus_terms": focus_terms[:12]}

        state.flags["next_step"] = "answer_composer"

    except Exception as e:
        logger.error(f"Evidence fetch error: {e}")
        state.flags["next_step"] = "answer_composer"
    finally:
        if con: con.close()
