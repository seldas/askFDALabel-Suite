# Project Structure Guide

This project has been refactored from a monolithic `app.py` into a modular architecture to improve maintainability and scalability.

## Directory Overview

*   **`srcs/`**: Contains the source code of the application.
    *   **`__init__.py`**: Application factory (`create_app`), database initialization, and extension setup.
    *   **`config.py`**: Configuration class (Environment variables, paths).
    *   **`extensions.py`**: Flask extensions (`db`, `migrate`, `login_manager`).
    *   **`models.py`**: SQLAlchemy database models (`User`, `Project`, `Favorite`, etc.).
    *   **`prompts.py`**: System prompts for AI Agents (DILI, DICT, DIRI).
    *   **`utils.py`**: General utility functions (text normalization, ID extraction).
    *   **`services/`**: Business logic layers.
        *   **`xml_handler.py`**: SPL XML parsing, metadata extraction, HTML conversion.
        *   **`fda_client.py`**: Interacting with OpenFDA, DailyMed, and fetching/searching labels.
        *   **`ai_handler.py`**: Interacting with Google Gemini API (Chat, Summarization, Assessments).
    *   **`routes/`**: Flask Route Definitions.
        *   **`main.py`**: Main UI pages (`/`, `/search`, `/label`, `/compare`).
        *   **`api.py`**: JSON API endpoints (`/api/...`, AJAX handlers).
        *   **`auth.py`**: Authentication (`/login`, `/register`, `/logout`).

*   **`templates/`**: HTML templates.
*   **`static/`**: Static assets (CSS, JS, Images).
*   **`data/`**: Data storage (Uploads, local DB).
*   **`app.py`**: Minimal entry point to run the application.

## Key Workflows

1.  **Search & Fetch**: `routes/main.py` -> `services/fda_client.py` -> OpenFDA API.
2.  **View Label**: `routes/main.py` -> `services/fda_client.py` (get XML) -> `services/xml_handler.py` (parse XML).
3.  **AI Chat**: `routes/api.py` -> `services/ai_handler.py` -> Gemini API.
4.  **Comparison**: `routes/main.py` -> `services/xml_handler.py` (Flatten & Aggregate) -> `difflib` logic.

## For AI Agents

When modifying the code:
*   **Database Schema**: Edit `srcs/models.py`.
*   **New Routes**: Add to `srcs/routes/` and register in `srcs/__init__.py`.
*   **Business Logic**: Prefer adding to `srcs/services/` rather than cluttering routes.
*   **Prompts**: Update `srcs/prompts.py`.
