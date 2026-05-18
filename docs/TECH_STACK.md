# Technology stack

> What's used and why. Sister docs: [ARCHITECTURE.md](ARCHITECTURE.md), [DEVELOPMENT.md](DEVELOPMENT.md).

## Backend

| Layer       | Tech                            | Why this and not something else                                                                                                                                                              |
| ----------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime     | Python 3.11+                    | Available on every Windows machine that has Microsoft Store Python or the python.org installer. Type hints, `match`, `asyncio` improvements all useful.                                       |
| Web         | [FastAPI](https://fastapi.tiangolo.com/) 0.115 | Auto-generated OpenAPI/Swagger docs (`/docs`), Pydantic validation, async-first, minimal boilerplate. For an API this small Flask/Django would be heavier than the actual code. |
| ASGI server | [Uvicorn](https://www.uvicorn.org/) 0.32 | Default FastAPI server. `--reload` for dev, fast enough for a single-user local app.                                                                                                       |
| ORM         | [SQLAlchemy](https://www.sqlalchemy.org/) 2.x | Decoupled from FastAPI, mature, handles SQLite's quirks (NULL semantics, threading) gracefully. The 2.x typed API is used throughout.                                                |
| DB          | SQLite                          | Zero-install, single file, perfect for local desktop apps. No daemon, no permissions setup. Loses safety on concurrent writes from multiple processes — irrelevant here.                       |
| Validation  | Pydantic v2                     | Comes with FastAPI; same models drive request validation and response shaping.                                                                                                              |
| Excel       | [pandas](https://pandas.pydata.org/) 2.2 + [openpyxl](https://openpyxl.readthedocs.io/) 3.1 | pandas absorbs the locale / encoding / column-shape variation across PT bank exports. openpyxl is the engine for `.xlsx`. Heavyweight, but lazy-imported only in the upload path.   |
| Multipart   | `python-multipart`              | Required for FastAPI's file upload form fields.                                                                                                                                              |
| Testing     | [pytest](https://docs.pytest.org/) 8.3 + [httpx](https://www.python-httpx.org/) 0.28 | pytest for the suite, httpx because FastAPI's `TestClient` depends on it. In-memory SQLite per test — see [TESTING.md](TESTING.md).        |

## Frontend

| Layer        | Tech                                                                          | Why                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework    | [React](https://react.dev/) 18                                                 | Ubiquitous, mature, gigantic ecosystem. The pages here are simple enough that Vue/Svelte would do too — React wins on familiarity.                                                       |
| Build        | [Vite](https://vitejs.dev/) 5                                                  | Fast dev server (sub-second HMR), zero-config TS/JSX, built-in proxy for the `/api` path (no CORS dance in dev). Production build is a static `dist/`.                                    |
| Routing      | [React Router](https://reactrouter.com/) 6                                     | Standard choice. The router lives in `App.jsx`; pages don't know about the router beyond `<Link>` / `useSearchParams`.                                                                    |
| Styling      | [Tailwind CSS](https://tailwindcss.com/) 3                                     | Utility-first lets you build a coherent UI without dragging in a component library. The brand palette is customized in `tailwind.config.js`.                                              |
| Charts       | [Recharts](https://recharts.org/) 2                                            | Declarative React-native API, plays well with Tailwind, batteries-included tooltips and legends. Not the fastest with thousands of data points; fine here.                                  |
| Icons        | [lucide-react](https://lucide.dev/) 0.451                                      | Clean, consistent set, tree-shakes per-icon, MIT.                                                                                                                                          |
| Toasts       | [sonner](https://sonner.emilkowal.ski/) 1.7                                    | Tiny (~3 kB gzipped), API-driven (no JSX-wrapping notification provider), supports action buttons natively — used for undo on destructive flows.                                                       |
| Fonts        | Manrope + JetBrains Mono (Google Fonts via `<link>`)                           | Manrope for UI (geometric-friendly, distinct from the ubiquitous Inter), JetBrains Mono for tabular numbers in balances and ledger tables.                                                  |

No state-management library, no React Query, no Zustand. Pages own their own fetches and `useState`. If the app ever grows past ~10 pages this should be revisited.

The visual identity uses a custom palette defined in [`tailwind.config.js`](../frontend/tailwind.config.js): plum/aubergine (`brand-*`) for the primary identity, warm amber (`accent-*`) for highlights and the logo glyph, and a slightly warm neutral (`surface-*`) for backgrounds. Skeleton loaders ([Skeleton.jsx](../frontend/src/components/Skeleton.jsx)) replace the previous text-based "A carregar..." placeholders.

## Tooling

| Tool         | Why                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `start.bat`  | One-click launcher for Windows: venv + npm install on first run, then both servers + browser. Replaces docker-compose for this single-machine app. |
| `.gitignore` | Keeps `euroly.db`, `__pycache__`, `node_modules`, and bank exports out of version control.                          |

## Versions in use

See [`backend/requirements.txt`](../backend/requirements.txt) and [`frontend/package.json`](../frontend/package.json) for the pinned versions.

## Choices I considered and rejected

- **Electron / Tauri**. Would let Euroly ship as a single executable. Worth doing if the project grows — for now `start.bat` is a fine substitute and avoids the build complexity.
- **PostgreSQL**. Overkill for single-user local-only data. SQLite covers every query pattern Euroly has.
- **TypeScript on the frontend**. Considered. Skipped for velocity; the surface area is small and JSDoc + Pydantic at the backend boundary catches most shape errors.
- **Alembic migrations**. Worth the setup once schema changes start hurting. For now, "delete `euroly.db` to reset" is documented and acceptable for an early personal-use app.
- **Auth (FastAPI Users / Authlib)**. Euroly is single-user local. Auth would be ceremony, not security; if the API ever leaves localhost, this needs to change.
