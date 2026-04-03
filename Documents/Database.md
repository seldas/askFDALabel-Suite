# Database Construction and Migration (PostgreSQL)

This document outlines the construction, initialization, and migration processes for the PostgreSQL database used by the askFDALabel-Suite. The project utilizes a multi-schema approach:
*   `labeling` schema: For Structured Product Labeling (SPL) data, including XML content and full-text search.
*   `public` schema: For application data such as users, projects, favorites, annotations, and pharmacology databases (DrugTox, PGx).

**Note:** The SQLite database implementation is outdated and has been archived. All current development and deployment rely exclusively on PostgreSQL.

## 1. Prerequisites

Before initializing the database, ensure the following are set up:
*   **Docker & Docker Compose:** Required to run the PostgreSQL (`pgvector`) instance.
*   **Python Virtual Environment:** Create a venv and install dependencies from `backend/requirements.txt`.
*   **Environment Variables:** Configure `.env` with a valid `DATABASE_URL`.
    *   Example: `DATABASE_URL=postgresql://afd_user:afd_password@localhost:5432/askfdalabel`

## 2. PostgreSQL Instance Setup

The PostgreSQL server uses the `ankane/pgvector` image to support vector embeddings.

*   **Service Name:** `db`
*   **Port Mapping:** Host `5432` is mapped to container `5432` to allow external script access.
*   **Data Persistence:** Data is stored in `./database/pgdata`.

To start the database:
```bash
docker compose up -d db
```

### Enable pgvector Extension
The `vector` extension must be enabled manually or via script before creating embedding tables:
```bash
python scripts/database/enable_pgvector.py
```

## 3. Schema Initialization

### 3.1. Public Schema (Application Data)
The public schema contains core application models. While Alembic is used for migrations, the initial schema can be created using SQLAlchemy's `create_all()`:
```bash
python scripts/database/init_public_schema.py
```

**Key Application Models (Alembic Managed):**
*   `User`: User authentication and role management.
*   `Project`: Container for drug-related analysis tasks.
*   `Favorite`: Drug label metadata saved by the user.
*   `AeAiAssessment`: **(New)** Caches AI semantic matching results for adverse event analysis.
*   `ToxAgent`: Consolidated toxicity assessment and report storage.
*   `ProjectAeReport`: Background task management for batch AE profiling.

**Schema Refinement:**
To prevent truncation errors with long drug names or metadata (e.g., from FDALabel Excel imports), certain columns must be converted to `TEXT`. Run the following script after initial creation:
```bash
python scripts/database/fix_favorite_columns.py
```

### 3.2. Labeling Schema (SPL Data)
The `labeling` schema handles bulk SPL data and full-text search indexes.
```bash
python scripts/database/pg_init_labeldb.py
```

## 4. Data Population

### 4.1. SPL Labels
Import bulk SPL data from DailyMed ZIP files:
```bash
python scripts/database/pg_import_labels.py --downloads-dir data/downloads/dailymed --storage-dir data/spl_storage
```

### 4.2. DrugToxicity (DrugTox)
Populate the drug toxicity database from the provided Excel update:
*   **Source:** `data/downloads/ALT_update_latest.xlsx`
*   **Command:**
    ```bash
    python scripts/migration/03_import_drugtox.py
    ```

### 4.3. Pharmacogenomics (PGx)
Populate the PGx biomarker database:
*   **Source:** `data/downloads/biomarker_db/Table of Pharmacogenomic Biomarkers in Drug Labeling FDA.xlsx`
*   **Command:**
    ```bash
    python scripts/migration/02_import_pgx.py
    ```

### 4.4. MedDRA Dictionary
Populate MedDRA tables for FAERS analysis (requires MedAscii files):
*   **Source Path:** `data/downloads/MedDRA_28_0_ENglish/MedAscii/`
*   **Command:**
    ```bash
    python scripts/migration/01_import_meddra.py
    ```

## 5. Maintenance & Utilities

The `scripts/database/` directory contains several utility scripts for database management:
*   `pg_utils.py`: Core `PGUtils` class for connections and bulk operations.
*   `list_tables_pg.py`: Lists all schemas, tables, and row counts.
*   `enable_pgvector.py`: Enables the `pgvector` extension.
*   `fix_favorite_columns.py`: Converts character-limited columns to `TEXT`.
*   `check_schema.py`: Inspects column types and details for a specific table.
