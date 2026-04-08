# AskFDALabel

AskFDALabel is a full-stack FDA labeling intelligence suite. It combines a Next.js frontend, a unified Flask backend, PostgreSQL plus pgvector storage, and optional Oracle/internal FDALabel connectivity to support label search, project-based review, AI-assisted analysis, toxicology workflows, device intelligence, and validation tooling.

The authoritative implementation lives in `frontend/`, `backend/`, `scripts/`, and the database models under `backend/database/`.

## What the suite includes

### Global AI search (`/search`)
A grounded label-search workspace backed by the `backend/search` blueprint. The current search stack includes:
- conversational search entry points (`/api/search/chat`, `/api/search/search_agentic_stream`)
- a semantic pipeline under `backend/search/scripts/semantic_core/`
- semantic retrieval over `label_embeddings`
- keyword retrieval, reranking, evidence fetching, and answer composition
- export helpers for filtered result sets

### Project dashboard (`/dashboard`)
The dashboard is the main label review workspace. It supports:
- importing FDALabel Excel exports
- uploading SPL XML or ZIP files for local comparison
- searching labels and opening label detail views
- organizing labels and saved comparisons into projects
- label annotations and saved notes
- AI chat and compare summaries
- deep-dive analysis endpoints
- FAERS-based adverse-event workflows and AI rematching
- MedDRA label scans and profile lookups
- PGx, DILI, DICT, and DIRI assessment endpoints
- admin-only user and database maintenance features

### Label comparison (`/labelcomp`)
A side-by-side comparison workspace for up to four labels, with support for:
- selecting labels from projects
- adding labels by `set_id`
- uploading local SPL files
- highlighted section-level differences
- AI-generated comparison summaries
- saving comparisons back into projects

### askDrugTox (`/drugtox`)
A dedicated toxicology module for browsing harmonized toxicity records. The current backend exposes:
- dataset statistics
- filtered drug browsing
- discrepancy analysis
- latest RLD lookup
- per-drug history and market context
- company portfolio and company-level toxicity summaries

### Device intelligence (`/device`)
A device-focused module backed by openFDA endpoints. It provides:
- 510(k) and PMA search
- device metadata lookup
- MAUDE event summaries
- recall and enforcement summaries
- AI comparison of device IFU content

### Local query (`/localquery`)
A lightweight query and export surface for the local labeling database. It supports:
- quick search by brand, generic, `set_id`, or application number
- autocomplete
- random label sampling
- export to Excel for dashboard import or offline review

### Web validation tool (`/webtest`)
An internal regression and probing tool for FDALabel web endpoints. It works with Excel templates, stores history, and records timing and count-based checks under `backend/webtest/`.  
This function is designed for FDALabel website auto testing, as required by a specific user group.

### Supporting utilities
The repo also includes:
- an admin/management page for users and database update tasks
- bookmarklet-based ELSA/snippet helpers under `/snippet`
- import and maintenance scripts under `scripts/`
- an optional nginx reverse proxy under `deploy/nginx/`

## Architecture at a glance

### Frontend
- Next.js `16.1.6`
- React `19`
- MUI-based application UI
- app-router pages under `frontend/app/`
- default app base path: `/askfdalabel`

### Backend
- Flask application assembled in `backend/app.py`
- dashboard app factory in `backend/dashboard/__init__.py`
- blueprints registered at:
  - `/api/dashboard`
  - `/api/search`
  - `/api/drugtox`
  - `/api/labelcomp`
  - `/api/device`
  - `/api/localquery`
  - `/api/webtest`

### Data layer
- PostgreSQL is the primary runtime database
- `pgvector` is used for semantic label search
- the `labeling` schema stores SPL label metadata and sections
- public-schema tables store users, projects, favorites, reports, MedDRA, PGx, DrugTox, embeddings, and system tasks
- optional Oracle connectivity is supported through `FDALabelDBService`

### AI and external data sources
- Gemini via `google-genai`
- OpenAI-compatible endpoints for internal Llama or similar services
- Elsa integration for internal FDA workflows
- local sentence-transformer embeddings when `EMBEDDING_PROVIDER=local`
- openFDA for FAERS and device data
- DailyMed and SPL ZIP ingestion for label content
- Orange Book, MedDRA, PGx, and DrugTox import pipelines

## Repository layout

```text
backend/             Flask app, blueprints, services, models, migrations
frontend/            Next.js app-router frontend
Documents/           Living project documentation (currently being refreshed)
data/                Runtime data, downloads, SPL storage, uploads
scripts/             Import, database, AI, migration, and utility scripts
deploy/nginx/        Optional reverse proxy for /askfdalabel and /askfdalabel_api
backend/webtest/     Validation templates, history, and results
idea/                Historical notes and completed design writeups
```

## Prerequisites

For the containerized stack:
- Docker
- Docker Compose / `docker compose`

For local development:
- Python `3.12` recommended
- Node.js `22` recommended
- PostgreSQL with the `pgvector` extension

## Environment configuration

Create a root `.env` file before starting the app.

A few important notes before you copy values from `.env.template.txt`:
- the running code reads `GOOGLE_API_KEY`, not `GEMINI_API_KEY`
- the running code reads `LOCAL_QUERY`, not `LOCAL-QUERY`
- `DATABASE_URL` is required by the backend
- `LABEL_DB=POSTGRES` is the safest default unless Oracle access is configured

A minimal local `.env` usually looks like this:

```env
# Core runtime
DATABASE_URL=postgresql://afd_user:afd_password@localhost:5432/askfdalabel
LABEL_DB=POSTGRES
LOCAL_QUERY=True
SECRET_KEY=change-me

# Ports
HOST=0.0.0.0
BACKEND_PORT=8842
FRONTEND_PORT=8841
FRONTEND_BASE_PATH=/askfdalabel

# Frontend path helpers
NEXT_PUBLIC_APP_BASE=/askfdalabel
NEXT_PUBLIC_API_BASE=/askfdalabel_api
NEXT_PUBLIC_DASHBOARD_BASE=/askfdalabel

# AI providers
GOOGLE_API_KEY=
OPENFDA_API_KEY=
ELSA_API_NAME=
ELSA_API_KEY=
ELSA_MODEL_ID=
LLM_URL=
LLM_KEY=
LLM_MODEL=meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8

# Embeddings
EMBEDDING_PROVIDER=local
LOCAL_EMBEDDING_MODEL_ID=all-mpnet-base-v2
```

Optional Oracle/internal FDALabel settings:

```env
FDALabel_HOST=
FDALabel_PORT=1521
FDALabel_SERVICE=
FDALabel_USER=
FDALabel_PASSWORD=
```

Routing note:
- the suite now uses standardized path-prefix handling. For most deployments (including local development), keep `NEXT_PUBLIC_API_BASE=/askfdalabel_api` and `NEXT_PUBLIC_APP_BASE=/askfdalabel`.
- the `next.config.ts` and `FetchPrefix.tsx` utilities ensure that these paths work correctly whether running behind nginx or during direct local development.

## Running with Docker

### 1. Start the core stack
From the repo root:

```bash
cp .env.template.txt .env
# edit .env and correct the variable names noted above

docker compose up --build -d
```

This starts:
- `db` (PostgreSQL + pgvector)
- `backend` (Flask)
- `frontend` (Next.js)

### 2. Publish the app to host ports with nginx
The checked-in root `docker-compose.yml` uses `expose` for `frontend` and `backend`, so those services are reachable inside Docker but are not published directly to host ports. To access the app from your browser using the provided deployment layout, start the optional nginx proxy:

```bash
docker compose -f deploy/nginx/docker-compose.yml up --build -d
```

Then open:

```text
http://localhost/askfdalabel/
```

The nginx layer also maps API traffic under:

```text
http://localhost/askfdalabel_api/
```

### 3. Stopping containers

```bash
docker compose down
docker compose -f deploy/nginx/docker-compose.yml down
```

To remove the database volume contents as well:

```bash
docker compose down -v
```

### 2. Running in local development

Local development is fully supported with consistent path-prefix behavior across all modules. The standardized `APP_BASE` and `API_BASE` configurations ensure that the local development environment closely matches the production nginx routing layout.

#### 1. Start PostgreSQL
You can use the bundled container for the database:

```bash
docker compose up -d db
```

#### 2. Create the Python environment
From the repo root:

```bash
python -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

On Windows, activate the environment with `venv\Scripts\activate`.

#### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

#### 4. Start frontend and backend together
From `frontend/`:

```bash
npm run dev:all
```

This uses the helper scripts in `frontend/scripts/` to:
- start Next.js on `http://localhost:8841/askfdalabel`
- start Flask on `http://localhost:8842`

Backend health check:

```text
http://localhost:8842/health
```

## Database Initialization and Maintenance

The application uses a two-schema layout in PostgreSQL (`public` and `labeling`). Follow these steps to initialize a **new** system or update an **existing** one. All scripts are idempotent and will safely update schema/columns if the database already exists.

### Step-by-Step Initialization
Run these from the repo root with your virtual environment activated:

1. **Enable pgvector**: Required for AI search.
   ```bash
   python scripts/db_init/db_01_enable_pgvector.py
   ```
2. **Initialize Labeling Schema**: Creates the `labeling` tables and optimized search indexes.
   ```bash
   python scripts/db_init/db_02_init_labeling_schema.py
   ```
3. **Initialize Public Schema**: Creates application tables (users, projects, etc.) via SQLAlchemy.
   ```bash
   python scripts/db_init/db_03_init_public_schema.py
   ```
4. **Import Orange Book**: Essential for identifying RLD/RS labels.
   ```bash
   python scripts/db_init/db_04_import_orange_book.py
   ```
5. **Import EPC Indexing**: Required for the Deep Dive "Pharmacologic Class" analysis.
   ```bash
   python scripts/db_init/db_05_import_epc_indexing.py
   ```
6. **Create Admin User**: Sets up the initial login (default: admin / 1986414).
   ```bash
   python scripts/db_init/db_06_create_admin.py
   ```
7. **Import Labels**: Syncs SPL files from storage to the database.
   ```bash
   # Add --force to re-process and update UNII/EPC for existing labels
   python scripts/db_init/db_07_import_labels.py --force --skip-unpack
   ```

## Data and maintenance workflows

### Label data ingestion
Relevant paths and scripts:
- SPL ZIP storage: `data/spl_storage/`
- uploads and temporary imports: `data/uploads/`
- DailyMed downloader: `scripts/labels/download_dailymed.py`
- PostgreSQL initialization: `scripts/db_init/` (See Step-by-Step above)
- Main importer: `scripts/db_init/db_07_import_labels.py`

### Reference and enrichment datasets
- Orange Book import: `scripts/db_init/db_04_import_orange_book.py`
- MedDRA import: `backend/admin/tasks/import_meddra.py` and `scripts/migration/01_import_meddra.py`
- PGx import: `scripts/migration/02_import_pgx.py`
- DrugTox import: `backend/admin/tasks/import_drugtox.py` and `scripts/migration/03_import_drugtox.py`
- EPC Indexing: `scripts/db_init/db_05_import_epc_indexing.py`

### Embeddings and semantic search maintenance
- embedding sync: `scripts/ai/sync_label_embeddings.py`
- vector index creation: `scripts/ai/create_vector_index.py`
- pgvector checks: `scripts/ai/check_pg_vector.py`

### Validation assets
- Web test templates: `backend/webtest/*.xlsx`
- Web test history: `backend/webtest/history/`
- Web test results: `backend/webtest/results/`

## Authentication and administration

The dashboard includes built-in user authentication and admin-only maintenance endpoints.

Admin capabilities currently include:
- user creation, deletion, and role management
- password updates
- long-running database update tasks with progress polling and task logs

The admin UI is exposed in the frontend under `/management`, and the corresponding backend routes live under `/api/dashboard/admin`.

## Current documentation status

This README is intended to be the current top-level entry point for the repo.

Additional technical documentation is being refreshed under `Documents/`. At the moment, the existing `Documents/Database.md` may still be useful as a partial reference, but it should be read alongside the actual code until the remaining docs are updated.

## Known implementation notes

- `idea/` contains historical notes and completed design writeups; it is not the authoritative description of the current code.
- The backend loads environment variables from the repo-root `.env`.
- The frontend expects the backend under `/api/*` in direct development, and under `/askfdalabel_api/*` when routed through nginx.
- The application creates required data directories on startup.
- MedDRA-dependent features will run with reduced detail if MedDRA tables have not been populated.
- Some functionality becomes richer when Oracle/internal FDALabel access is available, but the suite is designed to run in PostgreSQL-only mode as well.



