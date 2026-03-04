# Bug Logs and Reports

## 1. PROD Backend Port Issue (Completed)
**Problem:** In Production, the frontend always looks for port 8842 as the backend, even if `BACKEND_PORT` is set to something else (like 8849) in `.env`.
**Solution/Steps:**
1.  **Environment Sync during Build:** Next.js rewrites in `next.config.ts` are often evaluated during `next build`. Ensure the `.env` file is present in the project root *before* running the build command.
2.  **Verify .env Loading:** Check that the path in `frontend/next.config.ts` correctly resolves to the project root `.env`:
    `const envPath = path.resolve(process.cwd(), "../.env");`
3.  **Manual Override:** If the build environment doesn't support `.env` files, provide `BACKEND_PORT` as an environment variable directly to the build command:
    `BACKEND_PORT=8849 npm run build` (or similar).

## 2. search_v2 Oracle Version Fallback (Completed)
**Problem:** `config.py` in `search_v2` defaults to Oracle table names/prefixes, causing errors (like `DRUGLABEL.SPL_SEC not found`) during local DB searches.
**Solution/Steps:**
1.  **Check LABEL_DB Setting:** Ensure `.env` has `LABEL_DB=LOCAL`.
2.  **Verify label.db Existence:** The system fallbacks to Oracle if `data/label.db` is not found. Ensure the file exists in the correct path.
3.  **Path Resolution:** Check `backend/search/scripts/search_v2_core/config.py`'s `PROJECT_ROOT` calculation. If running in a nested environment, the number of `..` might need adjustment.
4.  **Restart Backend:** Since `DB_TYPE` and table constants are determined at import time, any changes to `.env` or the presence of `label.db` require a backend restart.

## 3. Missing `favorite.active_ingredients` Column (Completed)
**Problem:** `sqlite3.OperationalError: no such column: favorite.active_ingredients` when accessing the Dashboard/Favorites.
**Solution/Steps:**
1.  **Run Fix Script:** Execute the provided database patch script from the project root:
    ```bash
    python scripts/fix_favorite_columns.py
    ```
2.  **Verify Database Path:** Ensure the script points to your actual database. The default in the script is `data/afd.db`.
3.  **Manual Migration (SQL):** If the script fails, you can manually add the missing columns using a SQLite browser or CLI:
    ```sql
    ALTER TABLE favorite ADD COLUMN active_ingredients TEXT;
    ALTER TABLE favorite ADD COLUMN labeling_type VARCHAR(200);
    -- (Add other missing columns as defined in backend/database/models.py)
    ```

## 4. Discrepancy Panel Enhancements
**Request:** Add "RLD available" tag and "FILTER BY SEVERITY GAP".
**Status:** Completed.
**Implementation:**
1.  Updated `backend/dashboard/services/fdalabel_db.py` to include `is_rld` in search results.
2.  Updated `backend/labelcomp/blueprint.py` to calculate `similarity_ratio` for section comparisons and pass `is_rld` in metadata.
3.  Updated `frontend/app/labelcomp/page.tsx` with:
    *   "RLD" tag display on label metadata cards.
    *   "FILTER BY SEVERITY GAP" toggle button in the Discrepancy Panel.
    *   Dynamic filtering logic using `useMemo` to show only significant changes (similarity < 0.5) when the filter is active.


## 5. AFL agent (search_V2) responding time:
--- Running Evidence Fetcher --- in sqlite (not sure in oracle) it stucks at this step when doing search, I think the potential issue is it tries to read xml (local files) for over 28 items which is very slow; particularly if multiple sections are needed from one labeling and were processed separately.

[1] INFO:search_v2:DB returned 28 rows.
[1] INFO:search_v2:--- Running Postprocess ---
[1] INFO:search_v2:--- Running Evidence Fetcher ---

we need to refine this strategy that for most queries that requires to read the whole xml, limited to the top 3 results instead of all. Also, optimize the workflow to make sure one labeling xml/zip will only be called ONCE for all needed sections.