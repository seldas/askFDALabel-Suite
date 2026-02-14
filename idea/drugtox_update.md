# Drug Toxicity Assessment Batch Update System

## Overview
This document outlines the design for a batch processing script aimed at automatically assessing drug toxicity (DILI, DICT, DIRI) for all human prescription (Rx) drugs available in the FDALabel database. The results will be stored in a centralized `tox_agent` table for rapid retrieval during label viewing.

## Workflow

### 1. Identify Target Drugs
- **Source:** FDALabel Internal Database (Oracle).
- **Query:** Search `druglabel.DGV_SUM_SPL` for all records where:
    - `MARKET_CATEGORIES` matches human prescription drug types (e.g., 'NDA', 'ANDA', 'BLA').
    - Only the most recent `EFF_TIME` for each `SET_ID` is selected.
- **SQL Sketch:**
  ```sql
  SELECT SET_ID, PRODUCT_NAMES, PRODUCT_NORMD_GENERIC_NAMES, EFF_TIME
  FROM (
      SELECT SET_ID, PRODUCT_NAMES, PRODUCT_NORMD_GENERIC_NAMES, EFF_TIME,
             ROW_NUMBER() OVER (PARTITION BY SET_ID ORDER BY EFF_TIME DESC) as rn
      FROM druglabel.DGV_SUM_SPL
      WHERE MARKET_CATEGORIES IN ('NDA', 'ANDA', 'BLA')
  ) WHERE rn = 1
  ```

### 2. Delta Detection
- **Comparison:** Compare the list of `set_id`s from FDALabel with the existing records in the `tox_agent` table.
- **Identification:** Filter out `set_id`s that already have completed and up-to-date assessments (based on `EFF_TIME`).
- **Priority:** New `set_id`s and those with significantly newer `EFF_TIME` than the stored assessment should be prioritized.

### 3. Automated Assessment (Batch Work)
For each target `set_id`, perform the following steps:
1. **XML Retrieval:** Fetch the SPL XML content using the existing `get_label_xml(set_id)` service.
2. **Metadata Extraction:** Use `extract_metadata_from_xml` to get brand/generic names.
3. **Section Extraction:** Use `run_assessment_logic` (or a refactored version) to extract:
    - Boxed Warning (34066-1)
    - Contraindications (34070-3)
    - Warnings and Precautions (34071-1, 43685-7)
    - Adverse Reactions (34084-4)
    - Drug Interactions (34073-7)
    - Use in Specific Populations (43684-0)
4. **AI Assessment:** Call the `generate_assessment` service sequentially for:
    - **DILI:** Using `DILI_prompt`.
    - **DICT:** Using `DICT_prompt`.
    - **DIRI:** Using `DIRI_prompt`.
5. **Data Aggregation:** Combine the results into a unified structure.

### 4. Persistence (`tox_agent` Table)
- **Table Name:** `tox_agent`
- **Schema:**
    - `id` (Primary Key, Integer)
    - `set_id` (String(100), Unique, Index)
    - `brand_name` (String(500))
    - `generic_name` (String(500))
    - `dili_report` (Text) - HTML content from AI
    - `dict_report` (Text) - HTML content from AI
    - `diri_report` (Text) - HTML content from AI
    - `last_updated` (DateTime)
    - `spl_effective_time` (String(50)) - To track if re-assessment is needed

### 5. Integration with Label View
- **Backend (API):** Modify `api_bp.route('/label/<set_id>')` (or similar) to:
    1. Check `tox_agent` for the `set_id`.
    2. If present, include `dili_report`, `dict_report`, and `diri_report` in the response.
- **Frontend (UI):** In the label view dashboard:
    1. If tox data is provided, display a "Toxicity Summary" tab or sidebar.
    2. If missing, show a "Generate Toxicity Report" button for manual trigger.

## Technical Considerations
- **Concurrency:** Implement a semaphore or similar mechanism to limit parallel AI calls (e.g., max 5 concurrent calls).
- **Rate Limiting:** Respect the rate limits of the configured AI provider (Gemini/OpenAI).
- **Error Handling:** Gracefully handle XML parsing errors and AI timeouts. Log `set_id`s that failed for manual review.
- **Database Performance:** Ensure `set_id` is indexed in `tox_agent`.
- **Update Cycle:** A standalone script `./scripts/update_tox_agent.py` can be executed via cron or manual trigger.
