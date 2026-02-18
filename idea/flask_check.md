# Flask Dependency and Legacy Code Audit

## Issue Summary
The current system suffers from a "split personality" where some routes and assets are served via a legacy Flask/Waitress configuration while others are handled by Next.js. Specifically, `frontend/public/dashboard/js/chat.js` and other legacy scripts are being served through `/api/dashboard/static/`, which Flask maps to the physical file on disk. Changes to these files are reflected in `dev` but not always in `prod` due to caching or the way Flask is configured in `backend/dashboard/__init__.py`.

Furthermore, multiple Flask routes still exist that attempt to use `render_template` for HTML files that have been deleted from the repository (e.g., `login.html`, `results.html`).

## Findings

### 1. Missing Templates
The following routes in `backend/dashboard/routes/` and `backend/labelcomp/blueprint.py` still use `render_template()`, but the underlying `.html` files were deleted in commit `785006a`:
- `auth.login` -> `login.html` (Deleted)
- `auth.register` -> `register.html` (Deleted)
- `auth.change_password` -> `change_password.html` (Deleted)
- `main.info` -> `info.html` (Deleted)
- `main.search` -> `selection.html` (Deleted)
- `main.view_label` -> `results.html` (Deleted)
- `main.my_labelings` -> `my_labelings.html` (Deleted)
- `labelcomp.compare_labels` -> `labelcomp.html` (Deleted in `8126865`)

### 2. Static File Serving Discrepancy
The backend is configured to serve `frontend/public/dashboard/` as a static folder at `/api/dashboard/static`:
```python
# backend/dashboard/__init__.py
static_dir = os.path.join(project_root, "frontend", "public", "dashboard")
app = Flask(
    __name__,
    template_folder=template_dir,
    static_folder=static_dir,
    static_url_path='/api/dashboard/static',
)
```
This means the "Production" Waitress server is directly serving the JS files. If the browser or a proxy (like a corporate cache) has a cached version of `/api/dashboard/static/js/chat.js`, changes won't appear.

### 3. Split Data/Project View
The user reported that project lists look different between `dev` and `prod`. This is likely because:
- **Dev:** Might be running against a local SQLite file (`data/afd.db`) or a different `DATABASE_URL`.
- **Prod:** Might be resolving a different `PROJECT_ROOT` or environment variables, potentially pointing to a different DB instance or even a different branch's data.

## Recommendations

### Short-Term Fixes
1.  **Cleanup Backend Routes:** Convert all remaining `render_template` calls to either:
    -   `jsonify` responses (if the frontend is intended to handle the UI).
    -   `redirect` to the corresponding Next.js route (e.g., `/dashboard`, `/search`, etc.).
2.  **Remove Legacy Template References:** Remove the `template_folder` configuration from `backend/dashboard/__init__.py` as it points to a non-existent directory.
3.  **Audit Static Serving:** If Next.js is supposed to serve all frontend assets, consider removing the `static_folder` from Flask and letting Next.js serve them from its own `public` directory (accessible via `/dashboard/js/...` instead of `/api/dashboard/static/js/...`).

### Migration Tasks
- [ ] Refactor `backend/dashboard/routes/main.py` to remove all HTML rendering.
- [ ] Refactor `backend/dashboard/routes/auth.py` to be purely API-based (JSON only).
- [ ] Update `frontend/app/dashboard/label/[setId]/page.tsx` and others to fetch scripts from Next.js public paths if possible, or ensure the proxy headers prevent caching.
- [ ] Verify `DATABASE_URL` consistency in production environment scripts.
