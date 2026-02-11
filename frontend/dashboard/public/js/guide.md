# JavaScript Architecture Guide

The frontend logic for AskFDALabel has been modularized from a monolithic `script.js` into smaller, functional modules located in `static/js/`. This guide explains the purpose of each file to assist AI agents and developers in understanding and maintaining the codebase.

## Directory Structure
`static/js/`
├── `utils.js`       - Common helper functions (e.g., text processing).
├── `ui.js`          - General UI interactions (TOC, Back-to-Top, Resizing).
├── `chat.js`        - AI Chatbox, Message handling, and Sticky Note logic.
├── `annotations.js` - User Manual Annotations (Highlighting & Comments).
├── `favorites.js`   - Project management and "Favorite" toggling logic.
├── `compare.js`     - Comparison Tool logic (checkboxes, AI summary).
├── `faers.js`       - FAERS Dashboard (Data fetching, Tables, Charts).
└── `tox.js`         - Toxicology Agents (DILI, DICT, DIRI) logic.

## Module Descriptions

### 1. `utils.js`
*   **Purpose:** Contains pure utility functions used across multiple modules.
*   **Key Functions:**
    *   `stripHtmlTags(htmlString)`: Removes HTML tags from a string.
    *   `escapeRegExp(string)`: Escapes special characters for Regex usage.
*   **Dependencies:** None.

### 2. `ui.js`
*   **Purpose:** Handles general layout interactions and non-specific UI enhancements.
*   **Key Features:**
    *   **Back to Top Button:** Controls visibility and scrolling behavior.
    *   **Table of Contents (TOC):** Toggles the sidebar panel.
    *   **Table Resizing:** logic for resizing columns in comparison diff tables.
*   **Dependencies:** `utils.js` (potentially).

### 3. `chat.js`
*   **Purpose:** Manages the AI Assistant chat interface and the AI-generated "Sticky Notes" (annotations).
*   **Key Features:**
    *   Chatbox open/close/resize.
    *   Sending messages to `/ai_chat`.
    *   Rendering Markdown responses.
    *   **AI Annotations:** Creates yellow badge icons (`chat-annotation-badge`) and popovers in the document based on AI answers.
*   **Dependencies:** `marked.js` (external lib), `utils.js`.

### 4. `annotations.js`
*   **Purpose:** Handles *User Manual* annotations (highlighting text and adding comments) via a popup toolbar.
*   **Key Features:**
    *   Selection detection logic (`handleSelection`).
    *   Toolbar rendering (Highlight color palette, Comment input).
    *   Saving/Deleting annotations to the backend API.
    *   Rendering saved annotations on load.
*   **Dependencies:** `utils.js`.

### 5. `favorites.js`
*   **Purpose:** Manages the "My Projects" system.
*   **Key Features:**
    *   **Active Project:** Reads/Writes to `localStorage` to persist the selected project context.
    *   **Favorites Dropdown:** Fetches and displays available projects.
    *   **Toggle Buttons:** Handles the star icons for saving labels/comparisons to projects.
*   **Dependencies:** None (relies on API).

### 6. `compare.js`
*   **Purpose:** Logic specific to the Comparison page and the selection process.
*   **Key Features:**
    *   **Comparison Form:** Validates checkboxes (max 3, same format).
    *   **Diff View:** Expand/Collapse sections.
    *   **AI Summary:** Generates comparison summaries via API.
*   **Dependencies:** `utils.js`.

### 7. `faers.js`
*   **Purpose:** Controls the "Real-World Safety" tab (FAERS Dashboard).
*   **Key Features:**
    *   **Data Fetching:** Loads FAERS data from `/api/faers/...`.
    *   **Coverage Table:** Renders the interactive table of adverse events.
    *   **Charts:** Renders Chart.js visualizations (Trend Analysis).
    *   **Safety Signals:** Highlights terms in the label text (`tagSafetySignals`).
    *   **AI Analysis:** "Ask AI" button (`?`) logic for individual reactions.
*   **Dependencies:** `Chart.js` (external lib), `marked.js`, `utils.js`.

### 8. `tox.js`
*   **Purpose:** Controls the "Agents" tab (DILI, DICT, DIRI, PGx).
*   **Key Features:**
    *   **Navigation:** Switches between agent modules.
    *   **Assessment:** Runs AI assessments (`/api/dili/assess/...`).
    *   **Risk Panel:** Updates the visual risk indicator based on AI reports.
    *   **Signal Rendering:** Parses and renders the evidence/score markdown.
*   **Dependencies:** `Chart.js`, `marked.js`, `utils.js`.

## Usage in Templates
HTML templates should include the specific scripts they need.
*   **`results.html`**: Needs `utils.js`, `ui.js`, `chat.js`, `annotations.js`, `favorites.js`, `faers.js`, `tox.js`.
*   **`compare.html`**: Needs `utils.js`, `ui.js`, `favorites.js`, `compare.js`.
*   **`selection.html`**: Needs `utils.js`, `favorites.js`.
