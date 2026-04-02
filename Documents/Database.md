# Database Construction and Migration (PostgreSQL)

This document outlines the construction, initialization, and migration processes for the PostgreSQL database used by the askFDALabel-Suite. The project utilizes a multi-schema approach, with a dedicated `labeling` schema for SPL (Structured Product Labeling) data and the default public schema for application-specific data.

**Note:** The SQLite database implementation is outdated and has been archived. All current development and deployment rely exclusively on PostgreSQL.

## 1. PostgreSQL Instance Setup

The PostgreSQL database server is provisioned and managed using Docker Compose.

*   **Service Name:** `db`
*   **Image:** `ankane/pgvector:latest` (provides PostgreSQL with `pgvector` extension for vector embeddings)
*   **Database Name:** `askfdalabel`
*   **User/Password:** `afd_user` / `afd_password` (defined in `docker-compose.yml` and expected in `.env`)
*   **Data Persistence:** Database data is stored in a Docker volume mapped to `./database/pgdata` on the host.

To start the database service, use Docker Compose:
```bash
docker compose up -d db
```

## 2. SPL Data Schema Initialization (`labeling` schema)

The schema for handling Structured Product Labeling (SPL) data is created within a dedicated schema named `labeling`. This schema includes tables for summary information (`sum_spl`), section contents (`spl_sections`), active ingredients mapping (`active_ingredients_map`), EPC mapping (`epc_map`), and tracking processed ZIP files (`processed_zips`). It also configures full-text search capabilities using PostgreSQL's `TSVECTOR` and `GIN` indexes.

This schema is primarily set up by the `pg_init_labeldb.py` script.

*   **Script:** `scripts/database/pg_init_labeldb.py`
*   **Purpose:** Creates the `labeling` schema and all necessary tables and indexes for SPL data storage.
*   **Execution:** While it can be run directly, it is typically invoked automatically by `pg_import_labels.py` if the `labeling.sum_spl` table is not found, ensuring the schema exists before data import.

**Manual Initialization:**
To manually initialize the `labeling` schema (e.g., in a clean database environment, or after dropping the schema):
```bash
python scripts/database/pg_init_labeldb.py
```
*(This command requires the `DATABASE_URL` environment variable to be set, or for `pg_utils.py` to be able to load it from a `.env` file.)*

## 3. Application Schema Migration (Alembic)

The application's core data model (e.g., user management, project-specific data, annotations) is managed using Flask-Migrate, which wraps [Alembic](https://alembic.sqlalchemy.org/en/latest/). Migrations apply changes to the `public` schema of the database.

*   **Configuration:** `backend/migrations/alembic.ini`
*   **Environment Script:** `backend/migrations/env.py`
*   **Migration Scripts:** Located in `backend/migrations/versions/`. Examples include `41e1e18194c9_make_label_annotation_project_id_.py` and `cbaf12977b82_add_faers_count_fields_to_.py`.

**Applying Migrations:**
Migrations are usually applied as part of the backend application startup or via specific Flask-Migrate commands (which would run within the backend container).

To run migrations, you typically need to connect to the running backend container or execute the command within the context of the Flask application. Assuming the backend service is running:

```bash
# Example (exact command might vary based on Flask-Migrate setup in backend)
docker compose exec backend flask db upgrade
```
*(Consult the `backend` Dockerfile or application entrypoint for the exact command to run Flask-Migrate within the container.)*

## 4. Data Population

After the `labeling` schema is initialized, the SPL data itself needs to be imported. This process involves unpacking daily SPL data ZIPs and parsing their XML content into the PostgreSQL database.

*   **Main Script:** `scripts/database/pg_import_labels.py`
*   **Purpose:** Orchestrates the downloading (though the script assumes ZIPs are already in `data/downloads/dailymed`), unpacking, parsing, and bulk insertion of SPL data into the `labeling` schema tables. It also incorporates RLD (Reference Listed Drug) and RS (Reference Standard) information from the Orange Book.
*   **Dependency:** Requires the `labeling` schema to be initialized (or `pg_import_labels.py` will call `pg_init_labeldb.py`).

**Execution:**
```bash
# From the project root, assuming the database service is running
python scripts/database/pg_import_labels.py --downloads-dir data/downloads/dailymed --storage-dir data/spl_storage
```
*   `--downloads-dir`: Directory where bulk DailyMed ZIP files are initially placed.
*   `--storage-dir`: Directory where individual SPL ZIPs are unpacked before parsing.

Other specialized data import scripts in `scripts/database/` include:
*   `pg_import_csv.py`: For general CSV data import.
*   `pg_import_embeddings_v2.py`: For importing vector embeddings (e.g., for search).

## 5. PostgreSQL Utilities

The `scripts/database/pg_utils.py` file provides a utility class `PGUtils` for common PostgreSQL operations, including:

*   Establishing connections (`get_connection`).
*   Creating schemas (`create_schema`).
*   Performing efficient bulk inserts (`bulk_insert`).
*   Executing arbitrary SQL queries (`execute_query`).

These utilities are used by the initialization and data population scripts.
