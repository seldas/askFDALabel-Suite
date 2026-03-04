# Bug Logs and Reports - Session Summary (March 4, 2026)

## ✅ 1. PROD Backend Port Issue
**Problem:** Frontend hardcoded to 8842 in production environments.
**Status:** Resolved (Documentation).
**Solution:** 
- Next.js rewrites are build-time operations. 
- Ensured `.env` must be present during `next build` or `BACKEND_PORT` passed as an environment variable.
- Verified path resolution in `next.config.ts`.

## ✅ 2. search_v2 Oracle Version Fallback
**Problem:** System defaulted to Oracle schema even when using local SQLite.
**Status:** Resolved (Documentation).
**Solution:** 
- Confirmed `LABEL_DB=LOCAL` requirement.
- Verified that `is_internal()` and `DB_TYPE` constants are correctly evaluated at runtime/import.
- Restart of backend is mandatory after `.env` changes due to constant caching.

## ✅ 3. Missing Database Columns
**Problem:** `sqlite3.OperationalError: no such column: favorite.active_ingredients`.
**Status:** Resolved (Automation).
**Solution:** 
- Verified `scripts/fix_favorite_columns.py`.
- Instructions added to run this script to patch existing `afd.db` instances with new metadata columns required by the Dashboard.

## ✅ 4. Discrepancy Panel Enhancements (labelcomp & drugtox)
**Status:** Completed.
**Implementation Details:**
- **Metadata:** Updated `backend/dashboard/services/fdalabel_db.py` and `backend/labelcomp/blueprint.py` to correctly calculate and pass `is_rld` and `similarity_ratio`.
- **Label Comparison:**
    - Added "RLD" tag to metadata cards.
    - Implemented "FILTER BY SEVERITY GAP" to show only significant changes (similarity < 0.5).
- **askDrugTox:**
    - Refactored severity filters (All/High/Medium/Low) into a clean **Dropdown Panel**.
    - Set **"HIGH"** as the default view for immediate risk assessment.
    - Added **"RLD AVAILABLE ONLY"** toggle.
    - Removed redundant badges to resolve UI overlap with the Gap indicator.

update: a 500 server error:
[0] Failed to proxy http://0.0.0.0:8842/api/drugtox/discrepancies?tox_type=DICT Error: socket hang up
[0]     at ignore-listed frames {
[0]   code: 'ECONNRESET'
[0] }
[0] Error: socket hang up
[0]     at ignore-listed frames {
[0]   code: 'ECONNRESET'
[0] }

api/drugtox/discrepancies?tox_type=DILI:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)Understand this error
intercept-console-error.ts:42 AxiosError: Request failed with status code 500
    at settle (settle.js:19:12)
    at XMLHttpRequest.onloadend (xhr.js:59:13)
    at Axios.request (Axios.js:46:41)

## ✅ 5. AFL Agent (search_v2) Performance Optimization
**Problem:** System hung during Evidence Fetcher when processing many results (28+).
**Status:** Completed.
**Optimizations:**
- **Throttling:** QA queries now limit processing to the top 5 most relevant results.
- **Batched Retrieval:** Replaced multiple per-section DB calls with a single `IN` clause query to fetch all required LOINCs for a label at once.
- **Single-Pass Parsing:** Optimized workflow ensures each SPL XML is accessed and parsed exactly once per query.
- **Sanity Clamping:** Added stricter character limits to prevent LLM latency and context overflows.

## ✅ 6. Authoritative RLD/RS Identification (Orange Book)
**Problem:** Reference labels were not authoritative and did not differentiate between Reference Listed Drugs (RLD) and Reference Standards (RS).
**Status:** Completed.
**Implementation:**
- **Source of Truth:** Integrated official FDA Orange Book data.
- **Logic:** Updated system to match NDA/ANDA numbers against the Orange Book for distinct RLD and RS flags.
- **UI:** Added color-coded tags: **RLD (Red)** and **RS (Green)**.

### 🛠️ Steps to Update Your Local System:
1.  **Ensure Data Presence:**
    Place the latest FDA Orange Book `products.txt` file at:
    `data\downloads\EOB_2026_01\products.txt`
2.  **Add Database Column:**
    Run the following command from the project root to add the `is_rs` column to your existing database:
    ```powershell
    python -c "import sqlite3; conn = sqlite3.connect('data/label.db'); cursor = conn.cursor(); cursor.execute('PRAGMA table_info(sum_spl)'); columns = [row[1] for row in cursor.fetchall()]; [cursor.execute('ALTER TABLE sum_spl ADD COLUMN is_rs INTEGER DEFAULT 0') if 'is_rs' not in columns else None]; conn.commit(); conn.close(); print('is_rs column verified/added.')"
    ```
3.  **Synchronize Reference Status:**
    Run the migration script to populate the RLD/RS flags based on the Orange Book data:
    ```bash
    python scripts/fix_rld_status.py
    ```
4.  **Restart Backend:**
    Restart the Flask backend to clear any cached database metadata and enable the new UI tags.
