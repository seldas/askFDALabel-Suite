# Local SQLite LabelDB Implementation Plan

## 🎯 Goal
Implement a lightweight SQLite database (`data/label.db`) to serve as a high-performance fallback for the FDALabel Oracle database. This supports `search_v2_core` and the `FDALabelDBService` when the internal network or Oracle connection is unavailable.

## 🏗️ Architecture (Hybrid Metadata + Filesystem)
The system uses a hybrid approach to optimize both search speed and storage efficiency:
- **Metadata Database:** `data/label.db` (Independent of `afd.db`). Stores slim metadata for fast filtering.
- **Content Storage:** `data/spl_storage/`. Stores individual SPL ZIP files extracted from DailyMed.
- **Engine:** SQLite 3 with **FTS5** extension for high-speed clinical keyword search.
- **Trigger:** Loaded automatically when `FDALabelDBService.get_connection()` fails to connect to Oracle.
- **Detection:** `DB_TYPE` is dynamically determined in `config.py` based on availability.

## ⚖️ Rationale: Hybrid vs. BLOB Scale
After architectural review, the **Hybrid (DB + Filesystem)** model was chosen over storing full XMLs as BLOBs in SQLite:
- **Search Performance:** Keeping `sum_spl` metadata slim ensures the table stays "dense" in memory. Large XML blobs would force SQLite to skip thousands of pages during a simple brand name search.
- **Offline Images:** By storing the original SPL ZIP files locally, the system has access to embedded images (chemical structures, charts) without needing an internet connection to DailyMed.
- **Maintenance:** A 100GB database file is difficult to `VACUUM` or backup. Spreading the weight across individual ZIP files on the filesystem is more robust.
- **Zero Duplication:** We extract the existing "Inner ZIPs" from the DailyMed weekly update once and link them, avoiding double-storage of XML text.

## 📊 Schema Design
The schema is optimized to balance metadata filtering and filesystem linkages.

### 1. `sum_spl` (Metadata Table)
Mimics `DGV_SUM_SPL` for primary filtering.
- `spl_id` (TEXT, PK), `set_id` (TEXT), `product_names` (TEXT), `generic_names` (TEXT)
- `manufacturer` (TEXT), `appr_num` (TEXT), `active_ingredients` (TEXT)
- `doc_type` (TEXT), `routes` (TEXT), `dosage_forms` (TEXT), `revised_date` (TEXT)
- `initial_approval_year` (INTEGER), `is_rld` (INTEGER)
- **`local_path` (TEXT)**: The relative path to the ZIP file in `data/spl_storage/`.

### 2. `spl_sections` & `spl_sections_search` (Content & FTS5)
- **`spl_sections`**: Stores raw XML fragments (`content_xml`) for near-instant UI rendering of specific sections.
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
1. [x] **Initialization:** `scripts/init_local_labeldb.py` creates the schema and FTS5 tables with `local_path`.
2. [x] **DailyMed Ingestion:** `scripts/update_labeldb_from_dailymed.py` extracts individual Inner ZIPs to `data/spl_storage/`.
   - Supports filters: `--filter prescription`, `human` (default), or `all`.
3. [x] **Service Integration:** `backend/dashboard/services/fdalabel_db.py` updated to read XML directly from local ZIP files.
4. [x] **Search Core Update:** `search_v2_core/sql.py` and `config.py` refactored for dialect-agnostic querying.
5. [x] **Validation:** Verified retrieval of full XML from local ZIPs for "Label View" and "Comparison" features.

## 🏁 Getting Started: Step-by-Step Setup

Follow these steps to build or rebuild your local high-performance label repository.

### 1. Prepare the Data
Ensure your DailyMed bulk ZIP file (downloaded from DailyMed's Full Release or Weekly Update service) is placed in:
`data/downloads/dailymed/`

### 2. Initialize the Database Schema
This command creates the `data/label.db` file and sets up the metadata tables and FTS5 search indexes.
```powershell
python scripts/init_local_labeldb.py
```

### 3. Run the Ingestion & Extraction
This script performs a "one-pass" build: it populates the database metadata, builds the search index, and extracts individual SPL ZIPs (containing XML + images) to `data/spl_storage/`.

**Recommended Command (Human Rx & OTC):**
```powershell
python scripts/update_labeldb_from_dailymed.py --zip data/downloads/dailymed/dm_spl_weekly_update_XXXX.zip --filter human
```

*Note: Use `--filter all` if you require veterinary or homeopathic data, but be aware this significantly increases disk usage.*

### 4. Automatic Usage
No further configuration is required. The `FDALabelDBService` is designed to:
1. Check if an internal Oracle DB is available.
2. If not, look up the `set_id` in your local `label.db`.
3. If found, it retrieves the XML directly from the ZIP in `data/spl_storage/`.
4. Fallback to the DailyMed web API only if the record is missing locally.

## 📋 Observations & Performance
- **Data Volume:** Imported **1,195 human labeling records** from the DailyMed weekly update.
- **Search Speed:** FTS5 `MATCH` queries provide sub-millisecond response times for content-heavy searches.
- **Storage Strategy:** Storing the "Inner ZIP" provides a 100% self-contained local repository of the drug's labels and images.

to use the local db correctly, we need to set:
LABEL_DB=LOCAL
LOCAL-QUERY=True