# Development guide

> Setting up a working dev environment, the project conventions, and how to extend the app. Sister docs: [ARCHITECTURE.md](ARCHITECTURE.md), [TECH_STACK.md](TECH_STACK.md).

## Requirements

- **Python** 3.11 or newer, on `PATH`. Check with `python --version`.
- **Node.js** 18 or newer (any LTS). Check with `node --version`.
- A modern browser (Chrome, Edge, Firefox).
- Windows is the supported OS; macOS / Linux work but `start.bat` won't — see [Manual setup](#manual-setup) below.

## First-time setup

```
git clone https://github.com/celiaagoncalves/euroly.git
cd euroly
start.bat
```

That's the whole thing on Windows. The script:

1. Creates `backend/.venv` if missing.
2. `pip install -r backend/requirements.txt`.
3. `npm install` in `frontend/`.
4. Launches uvicorn in a new console (`"Euroly API"`).
5. Launches vite in a new console (`"Euroly UI"`).
6. Opens [http://localhost:5173](http://localhost:5173).

Both console windows must stay open while you're using the app — closing one stops that half.

## Manual setup (macOS / Linux, or you prefer it)

Two terminals.

**Backend:**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate     # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000 --app-dir .
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Then visit `http://localhost:5173`.

## Day-to-day commands

| Task | Command |
|------|---------|
| Start everything (Win) | `start.bat` |
| Backend with reload | `cd backend && uvicorn main:app --reload --app-dir .` |
| Frontend with HMR | `cd frontend && npm run dev` |
| Production build (frontend) | `cd frontend && npm run build` |
| Preview built frontend | `cd frontend && npm run preview` |
| Run backend tests | `cd backend && .venv\Scripts\python.exe -m pytest` |
| Run a single test file | `pytest tests/test_importer.py` |
| Filter tests by name | `pytest -k pair` |
| Live API docs (Swagger) | open `http://localhost:8000/docs` |
| Live API docs (ReDoc) | open `http://localhost:8000/redoc` |

See [TESTING.md](TESTING.md) for the testing architecture, what's covered, and how to add new tests.

## Resetting the database

Whenever a schema change ships, the existing `backend/euroly.db` becomes incompatible with the new models (there's no migration tool — see [DATA_MODEL.md](DATA_MODEL.md#migrations)). To reset:

1. Close the **Euroly API** console (releases the file lock).
2. Delete `backend/euroly.db`.
3. Restart with `start.bat`. The DB is recreated and seeded with default categories. Accounts, credits, transactions and rules are gone — re-create them in Backoffice.

To preserve data through a reset, back up the file first: `copy backend\euroly.db backend\euroly.db.bak`.

## Project conventions

### Code style

- Python: standard library + FastAPI / SQLAlchemy idioms. No formatter is enforced; aim for what the existing files look like (4-space indent, `from x import y` ordered stdlib → 3rd party → local).
- JavaScript / JSX: no ESLint config yet; follow the existing style (2-space indent, single quotes, semicolons).
- No TypeScript today. If TS gets added later, do it on the frontend first.

### Naming

- Backend identifiers, file names, and route paths are English.
- Frontend identifiers are English; user-facing copy is **Portuguese (European)**.
- API field names are snake_case to match Python; frontend uses them as-is (no camelCase conversion).

### Comments

Comments answer "why?" not "what?". Module top docstrings describe the file's purpose. Class docstrings describe the entity. Inline comments call out non-obvious decisions (the dedupe key, the PT/US number-locale heuristic, the `cancelled` flag in dashboard fetches). See existing code for examples.

### Privacy invariants

- **Never seed Accounts or Credits.** Tests, fixtures, examples — use placeholders (`"Conta Principal"`, `"Cartão A"`).
- **Don't commit `backend/euroly.db`.** It's gitignored; verify with `git status` before committing.
- **Don't bake bank or creditor names into source code.** They live in the DB, configured at runtime.

See [ARCHITECTURE.md#privacy](ARCHITECTURE.md#privacy) for the rationale.

## Adding features

### A new API endpoint

1. Add the route to the appropriate file in `backend/routers/`.
2. Define Pydantic schemas alongside (no separate `schemas/` folder).
3. Mount the router in `backend/main.py` if it's a new file.
4. Add a helper to `frontend/src/api.js`.
5. Use it from a page or component.

### A new entity (table)

1. Add the model to `backend/database/models.py`. Set up relationships explicitly with `back_populates`.
2. Decide its **delete behavior** — by default Euroly nulls foreign keys on linked rows rather than cascading.
3. Add a router in `backend/routers/`.
4. **Decide if it should be seeded.** If it carries any user PII, the answer is no.
5. Update `docs/DATA_MODEL.md` and `CLAUDE.md`.
6. Bump the schema by deleting `euroly.db` and restarting.

### A new page

1. Create `frontend/src/pages/NewPage.jsx`. Use `useState` + `useEffect` for state; no global stores.
2. Register the route in `frontend/src/App.jsx`.
3. Add a nav item in `frontend/src/components/Layout.jsx` (pick a lucide-react icon).
4. Use the shared `<Card>` / `<Section>` from `components/Card.jsx` for consistent styling.
5. Format currency through `fmtEUR` exported from `api.js` — never instantiate `Intl.NumberFormat` directly.

### A new categorization rule type

The match types (`contains`, `exact`, `startswith`, `regex`) are encoded in two places:

- `backend/routers/rules.py` — the `RuleIn` Pydantic schema's `pattern` regex.
- The matching helpers in `routers/rules.py::_matches_rule` and `services/categorizer.py::_matches`.

Keep these in sync, or have both helpers call into a single shared function.

## Testing

There is no test suite today. If you're adding tests:

- Backend: pytest + httpx (FastAPI testclient).
- Frontend: Vitest + React Testing Library.
- The dedupe logic and the locale-aware number parser are the highest-value targets — both have a clear contract and clear edge cases.

Whatever you add, use placeholder names — see [Privacy invariants](#privacy-invariants).

## Releasing

There's no release process today. Reasonable next steps if Euroly ever ships outside one machine:

1. Tag the version (`git tag v0.x.0`).
2. `cd frontend && npm run build` and serve `dist/` from FastAPI's `StaticFiles`.
3. Bundle as an Electron / Tauri app, or as a single uvicorn + static-files binary with PyInstaller.

None of this is in place; PRs welcome.
