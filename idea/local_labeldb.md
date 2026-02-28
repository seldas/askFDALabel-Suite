# Local SQLite LabelDB Implementation Plan

## 🎯 Goal
Implement a lightweight SQLite database (`data/label.db`) to serve as a high-performance fallback for the FDALabel Oracle database. This supports `search_v2_core` and the `FDALabelDBService` when the internal network or Oracle connection is unavailable.

## 🏗️ Architecture
- **Location:** `data/label.db` (Independent of `afd.db`).
- **Engine:** SQLite 3 with **FTS5** extension for high-speed clinical keyword search.
- **Trigger:** Loaded automatically when `FDALabelDBService.get_connection()` fails to connect to Oracle.
- **Detection:** `DB_TYPE` is dynamically determined in `config.py` based on availability.

## 📊 Schema Design
The schema is optimized to balance metadata filtering and heavy XML content storage.

### 1. `sum_spl` (Metadata Table)
Mimics `DGV_SUM_SPL` for primary filtering.
- `spl_id` (TEXT, PK), `set_id` (TEXT), `product_names` (TEXT), `generic_names` (TEXT)
- `manufacturer` (TEXT), `appr_num` (TEXT), `active_ingredients` (TEXT)
- `doc_type` (TEXT), `routes` (TEXT), `dosage_forms` (TEXT), `revised_date` (TEXT)
- `initial_approval_year` (INTEGER), `is_rld` (INTEGER)

### 2. `spl_sections` & `spl_sections_search` (Content & FTS5)
- **`spl_sections`**: Stores raw XML fragments (`content_xml`) for UI rendering.
- **`spl_sections_search`**: Virtual FTS5 table storing stripped plain text (`content_text`) for near-instant keyword matching.

### 3. `processed_files` (Efficiency)
- Tracks `spl_id` and `processed_at` timestamps to ensure each unique label version is only imported once during bulk updates.

## 🚀 Search V2 Compatibility (SQL Translation)
The `sql.py` implementation uses a `SQLManager` to dynamically switch dialects:
- **Pagination:** `LIMIT` (SQLite) vs `ROWNUM` (Oracle).
- **Full-Text:** `MATCH` (SQLite FTS5) vs `CONTAINS` (Oracle Text).
- **Ranking:** `rank` (SQLite) vs `SCORE(1)` (Oracle).
- **Table Names:** Automatically strips schema prefixes (e.g., `DRUGLABEL.`) when in SQLite mode.

## 🛠️ Implementation Status
1. [x] **Initialization:** `scripts/init_local_labeldb.py` creates the schema and FTS5 tables.
2. [x] **DailyMed Ingestion:** `scripts/update_labeldb_from_dailymed.py` processes nested ZIP files from DailyMed.
   - Supports filters: `--filter prescription`, `human` (default), or `all`.
   - Handles multi-layer ZIP extraction and XML namespace parsing.
3. [x] **Service Integration:** `backend/dashboard/services/fdalabel_db.py` now supports dual-mode connectivity.
4. [x] **Search Core Update:** `search_v2_core/sql.py` and `config.py` refactored for dialect-agnostic querying.
5. [x] **Validation:** `scripts/test_search_v2_sqlite.py` verified all search templates (Metadata, Content, Ingredient, Set ID) against the local DB.

## 📋 Observations & Performance
- **Data Volume:** Imported **1,202 human labeling records** from the DailyMed weekly update.
- **Search Speed:** FTS5 `MATCH` queries provide sub-millisecond response times for content-heavy searches.
- **Storage:** Storing raw XML in a dedicated table allows for faithful rendering in the "Snippet" view while keeping the search index lean.
