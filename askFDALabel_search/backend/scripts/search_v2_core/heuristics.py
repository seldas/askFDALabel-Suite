# scripts/search_v2_core/heuristics.py
import re
from typing import List, Optional, Tuple

# -----------------------------
# Basic parsing
# -----------------------------
UUID_RE = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE)
SPL_ID_RE = re.compile(r"\bSPL[\s_-]*ID\b[:\s]*([0-9]{1,10})\b", re.IGNORECASE)
NDC_RE = re.compile(r"\bNDC\b[:\s]*([0-9]{4,5}-[0-9]{3,4})\b", re.IGNORECASE)
LOINC_RE = re.compile(r"\bLOINC\b[:\s]*([0-9]{4,5}-[0-9])\b", re.IGNORECASE)

COUNT_HINT_RE = re.compile(r"\b(how many|count|number of|total)\b", re.IGNORECASE)
COMPARE_HINT_RE = re.compile(r"\b(compare|difference|vs\.?|versus)\b", re.IGNORECASE)
LIST_SECTIONS_RE = re.compile(r"\b(list|show|what are)\b.*\b(sections|section codes|loinc)\b", re.IGNORECASE)

COMMON_SECTION_ALIASES = {
    "boxed warning": "34066-1",
    "warnings and precautions": "43685-7",
    "warnings": "34071-1",
    "adverse reactions": "34084-4",
    "contraindications": "34070-3",
    "indications": "34067-9",
    "dosage and administration": "34068-7",
}

def extract_first_uuid(text: str) -> Optional[str]:
    m = UUID_RE.search(text or "")
    return m.group(0) if m else None

def extract_spl_id(text: str) -> Optional[int]:
    m = SPL_ID_RE.search(text or "")
    return int(m.group(1)) if m else None

def extract_ndc(text: str) -> Optional[str]:
    m = NDC_RE.search(text or "")
    return m.group(1) if m else None

def extract_loinc(text: str) -> Optional[str]:
    m = LOINC_RE.search(text or "")
    return m.group(1) if m else None

def infer_section_loinc_codes(user_query: str) -> List[str]:
    q = (user_query or "").lower()
    hits = []
    for k, loinc in COMMON_SECTION_ALIASES.items():
        if k in q:
            hits.append(loinc)
    loinc_explicit = extract_loinc(user_query)
    if loinc_explicit:
        hits.append(loinc_explicit)

    seen = set()
    out = []
    for x in hits:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out

def is_count_query(user_query: str) -> bool:
    return bool(COUNT_HINT_RE.search(user_query or ""))

def is_compare_query(user_query: str) -> bool:
    return bool(COMPARE_HINT_RE.search(user_query or ""))

def is_list_sections_query(user_query: str) -> bool:
    return bool(LIST_SECTIONS_RE.search(user_query or ""))

# -----------------------------
# Content-needed heuristics
# -----------------------------
def _merge_unique(existing: Optional[List[str]], new: List[str]) -> List[str]:
    existing = existing or []
    seen = set()
    out = []
    for x in existing + (new or []):
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out

TOPIC_TO_LOINC = {
    "boxed_warning": ["34066-1"],
    "warnings_precautions": ["43685-7", "34071-1"],
    "adverse_reactions": ["34084-4"],
    "contraindications": ["34070-3"],
    "indications": ["34067-9"],
    "drug_interactions": ["34073-7", "34074-5"],
    "dosage_admin": ["34068-7"],
    "dosage_forms_strengths": ["43678-2"],
    "pregnancy": ["42228-7"],
    "lactation": ["77290-5"],
    "use_in_specific_pops": ["43684-0"],
    "pediatric": ["34081-0"],
    "geriatric": ["34082-8"],
}

CONTENT_REQUIRED_PATTERNS: List[Tuple[re.Pattern, List[str]]] = [
    (re.compile(r"\b(adverse (events?|reactions?)|side effects?|aEs?)\b", re.IGNORECASE), TOPIC_TO_LOINC["adverse_reactions"]),
    (re.compile(r"\b(indications?\b|indications?\s*(and|&)\s*(usage|use))\b", re.IGNORECASE), TOPIC_TO_LOINC["indications"]),
    (re.compile(r"\b(drug[-\s]*drug\s+interactions?|drug\s+interactions?|interactions?)\b", re.IGNORECASE), TOPIC_TO_LOINC["drug_interactions"]),
    (re.compile(r"\b(contraindications?)\b", re.IGNORECASE), TOPIC_TO_LOINC["contraindications"]),
    (re.compile(r"\b(boxed warning|black box( warning)?|box warning)\b", re.IGNORECASE), TOPIC_TO_LOINC["boxed_warning"]),
    (re.compile(r"\b(warnings?\s*(and|&)\s*precautions?|warnings?|precautions?)\b", re.IGNORECASE), TOPIC_TO_LOINC["warnings_precautions"]),
    (re.compile(r"\b(dosage\b|dose\b|dosing\b|administration\b|how to take)\b", re.IGNORECASE), TOPIC_TO_LOINC["dosage_admin"]),
    (re.compile(r"\b(strength(s)?|mg\b|mcg\b|g\b|units?\b)\b", re.IGNORECASE), TOPIC_TO_LOINC["dosage_forms_strengths"]),
    (re.compile(r"\b(pregnan(cy|t)|teratogenic|fetal)\b", re.IGNORECASE), TOPIC_TO_LOINC["pregnancy"]),
    (re.compile(r"\b(lactation|breast[\s-]*feeding)\b", re.IGNORECASE), TOPIC_TO_LOINC["lactation"]),
    (re.compile(r"\b(use in specific populations)\b", re.IGNORECASE), TOPIC_TO_LOINC["use_in_specific_pops"]),
    (re.compile(r"\b(pediatric|paediatric|children)\b", re.IGNORECASE), TOPIC_TO_LOINC["pediatric"]),
    (re.compile(r"\b(geriatric|elderly)\b", re.IGNORECASE), TOPIC_TO_LOINC["geriatric"]),
]

METADATA_ONLY_PATTERNS = re.compile(
    r"\b("
    r"manufacturer|company|who makes|marketed by|labeler|author|"
    r"set id|spl id|ndc|appr(_|\s)?num|nda|anda|bla|"
    r"document type|label type|marketing categor(y|ies)|"
    r"route(s)? of administration|route\b|dosage form(s)?\b|"
    r"epc|pharmacologic class|revised date|revision date|initial approval year"
    r")\b",
    re.IGNORECASE
)

def detect_content_need(user_query: str) -> Tuple[bool, List[str], str]:
    q = user_query or ""
    inferred: List[str] = []
    for pat, loincs in CONTENT_REQUIRED_PATTERNS:
        if pat.search(q):
            inferred = _merge_unique(inferred, loincs)
    if inferred:
        return True, inferred, "Matched content-required topic(s)."
    return False, [], "No strong content-required topic detected."

def is_metadata_only_question(user_query: str) -> bool:
    return bool(METADATA_ONLY_PATTERNS.search(user_query or ""))

# -----------------------------
# Ingredient intent
# -----------------------------
INGREDIENT_INTENT_RE = re.compile(r"\b(active ingredient|ingredients?|contains|contained|substance|api\b)\b", re.IGNORECASE)

def user_explicitly_wants_ingredient_search(user_query: str) -> bool:
    return bool(INGREDIENT_INTENT_RE.search(user_query or ""))
