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

## ✅ 5. AFL Agent (search_v2) Performance Optimization
**Problem:** System hung during Evidence Fetcher when processing many results (28+).
**Status:** Completed.
**Optimizations:**
- **Throttling:** QA queries now limit processing to the top 5 most relevant results.
- **Batched Retrieval:** Replaced multiple per-section DB calls with a single `IN` clause query to fetch all required LOINCs for a label at once.
- **Single-Pass Parsing:** Optimized workflow ensures each SPL XML is accessed and parsed exactly once per query.
- **Sanity Clamping:** Added stricter character limits to prevent LLM latency and context overflows.

## ✅ 6. Authoritative RLD Identification (Orange Book)
**Problem:** `is_rld` flag was hardcoded to 0 or based on inconsistent name matching.
**Status:** Completed.
**Implementation:**
- **Source of Truth:** Integrated official FDA Orange Book data (`data/downloads/EOB_2026_01/products.txt`).
- **Logic:** Updated `scripts/update_labeldb_from_dailymed.py` to match application numbers (NDA/ANDA) against the Orange Book RLD list.
- **Migration:** Created `scripts/fix_rld_status.py` to retroactively patch the `is_rld` column in the current `label.db`.
