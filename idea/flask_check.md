# Flask Dependency and Legacy Code Audit (Completed)

## Issue Summary
The system has been fully transitioned to a modern architecture using Next.js for the frontend and a Python-based JSON API for the backend. All legacy Flask routes that previously rendered HTML templates have been refactored to return JSON or handle redirects appropriately.

## Completed Actions

### 1. Route Refactoring (Completed)
The following routes have been refactored to be purely API-based (JSON):
- [x] `auth.login`, `auth.register`, `auth.change_password` (Now purely JSON POST routes)
- [x] `main.search`, `main.view_label` (Now purely JSON routes)
- [x] `labelcomp.index` (Now purely JSON route)
- [x] `main.info`, `main.my_labelings` (Now return JSON or redirect)

### 2. Initialization Cleanup (Completed)
- [x] `backend/dashboard/__init__.py`: Removed `static_folder` and `template_folder` configuration. Flask no longer serves legacy HTML or static files via `/api/dashboard/static/`.
- [x] `backend/app.py`: Verified as a clean unified app factory.

### 3. Frontend Cleanup (Completed)
- [x] `frontend/app/dashboard/label/[setId]/page.tsx`: Updated to use Next.js public paths and versioning.
- [x] `frontend/app/dashboard/page.tsx`: Removed legacy `DashboardClient` component.
- [x] `frontend/app/dashboard/DashboardClient.tsx`: Deleted the legacy theme-switching and modal logic that relied on non-existent elements and legacy API paths.

## Status of Discrepancies

### Split Data/Project View
The refactoring ensures that both `dev` and `prod` environments now communicate with the backend via the same API structure. 
- **Recommendation:** If project lists still differ, verify the `DATABASE_URL` environment variable in the shell where `npm run prod` is executed. Both should point to the same `data/afd.db` file (or the same remote DB) to see consistent data.

## Migration Tasks (All Complete)
- [x] Refactor `backend/dashboard/routes/main.py` to remove all HTML rendering.
- [x] Refactor `backend/dashboard/routes/auth.py` to be purely API-based (JSON only).
- [x] Refactor `backend/labelcomp/blueprint.py` to be purely API-based.
- [x] Clean up `backend/dashboard/__init__.py` (Removed template/static folder config).
- [x] Remove legacy `DashboardClient.tsx` and its references.
- [x] Verify all backend blueprints are JSON-API compliant.
