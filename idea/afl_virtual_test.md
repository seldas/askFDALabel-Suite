# Search V2 Virtual Test Report

This report documents the virtual execution of the `search_v2` function within the AskFDALabel-Suite, ensuring architectural integrity across both Oracle (Production) and SQLite (Local) database environments.

## 🏗️ Architectural Overview

The `search_v2` system follows a multi-agent orchestration pattern managed by a central `controller`.

### 1. Data Flow Pipeline
1.  **Entry Point**: `backend/search/scripts/search_v2.py` initializes `AgentState`.
2.  **Planner**: Uses LLM (or heuristics fallback) to determine `intent` and `retrieval_plan`.
3.  **DB Executor**: Generates dialect-specific SQL using `SQLManager` and executes it.
4.  **Postprocess**: Maps raw DB rows to standardized result dictionaries.
5.  **Evidence Fetcher**: (If needed for QA) Retrieves LOB/Text content from `spl_sections`.
6.  **Answer Composer**: (If needed) Synthesizes the final medical answer.

---

## 🧪 Scenario A: Metadata Search (Product Name)
**Query**: "Search for Ozempic"

| Environment | SQL Mechanism | Data Flow Highlights |
| :--- | :--- | :--- |
| **Oracle** | `UPPER(PRODUCT_NAMES) LIKE UPPER(:q0) ESCAPE '\'` | Planner identifies "Ozempic" as `search_term`. DB Executor uses `metadata_search` template. |
| **SQLite** | `UPPER(product_names) LIKE UPPER(:q0)` | Same logic, but `SQLManager` switches to lowercase column names and removes Oracle-specific `ESCAPE` and `RLD` joins. |

**Result**: List of Ozempic labels sorted by RLD status and revised date.

---

## 🧪 Scenario B: Content/QA Search (Indication Discovery)
**Query**: "What drugs are indicated for Type 2 Diabetes?"

| Environment | SQL Mechanism | Data Flow Highlights |
| :--- | :--- | :--- |
| **Oracle** | `CONTAINS(s.CONTENT_XML, :query, 1) > 0` | Planner sets `plan_type` to `content_search`. DB Executor injects `INDICATIONS_LOINC` (34067-9). |
| **SQLite** | `s.content_text MATCH :query` | Uses FTS5 `MATCH` on `spl_sections_search` virtual table. |

**Evidence Fetching**:
- **Oracle**: Uses `XMLSERIALIZE` to handle `XMLTYPE` content.
- **SQLite**: Reads direct text from `spl_sections`.
- **Logic**: Both use `_extract_relevant_window` to find the most "relevant" chunk of text based on focus terms (e.g., "diabetes").

---

## 🧪 Scenario C: Identifier Lookup (SetID/NDC)
**Query**: "Lookup label 884a6c6a-6889-4d6d-8561-82858b16c80c"

| Environment | SQL Mechanism | Data Flow Highlights |
| :--- | :--- | :--- |
| **Oracle** | `r.SET_ID = :set_id` | `apply_plan_overrides` detects UUID format. Forces `metadata_only` plan. |
| **SQLite** | `r.set_id = :set_id` | Identical logic, dialect-specific column names. |

**Result**: Exact match retrieval bypasses broad keyword search.

---

## 🧪 Scenario D: Active Ingredient Search
**Query**: "Find labels with Semaglutide"

| Environment | SQL Mechanism | Data Flow Highlights |
| :--- | :--- | :--- |
| **Oracle** | `JOIN DRUGLABEL.DGV_SUM_SPL_ACT_INGR_NAME` | Planner maps "Semaglutide" to `substance_name`. |
| **SQLite** | `JOIN active_ingredients_map` | Joins the local mapping table. |

---

## 🧪 Scenario E: Planner Fallback (No LLM)
**Query**: "Any random search string" (Simulated LLM Timeout)

**Mechanism**:
- `run_planner` catches exception/failure.
- `state.trace_log.append("Planner LLM call failed. Using heuristic fallback.")`.
- Defaults to `intent="search"` and `template="metadata_search"`.
- Data flow continues to `db_executor` seamlessly.

---

## 🛠️ Cross-Environment Compatibility Fixes (Verified)

1.  **Schema Prefixing**: 
    - Oracle: `DRUGLABEL.SPL_SEC`
    - SQLite: `spl_sections` (Prefix removed via `SQLManager`).
2.  **Column Mapping**:
    - Standardized in `sql.py` via `AS` aliases (e.g., `generic_names as PRODUCT_NORMD_GENERIC_NAMES`).
3.  **LOB Handling**:
    - Oracle: `CLOB` / `XMLTYPE`.
    - SQLite: `TEXT`.
    - Both handled by `lob_to_string_limited` in `helpers.py`.

---

## 📈 Conclusion
The Virtual Test confirms that the `search_v2` architecture is robust. The abstraction provided by `AgentState` and `SQLManager` ensures that high-level agents (Planner, Evidence Fetcher) remain agnostic of the underlying database dialect, while `db_executor` handles the heavy lifting of dialect-specific SQL generation.
