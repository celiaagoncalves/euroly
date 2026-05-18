# Architecture

> How Euroly is put together. For technology choices and rationale see [TECH_STACK.md](TECH_STACK.md); for entities and relationships see [DATA_MODEL.md](DATA_MODEL.md).

## System overview

Euroly is a two-process desktop-style web app:

```
 ┌─────────────────────────────────────────────────────────────┐
 │  Browser (http://localhost:5173)                            │
 │  ┌───────────────────────────────────────────────────────┐  │
 │  │  React + Vite SPA                                     │  │
 │  │  └─ Dashboard, Contas, Créditos, Transações,         │  │
 │  │     Validação, Backoffice                            │  │
 │  └───────────────────────────────────────────────────────┘  │
 │              │ fetch('/api/...')                            │
 └──────────────┼─────────────────────────────────────────────┘
                │
                │ Vite dev-server proxy
                │ /api/* → http://localhost:8000/api/*
                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  FastAPI (uvicorn, http://localhost:8000)                   │
 │  ┌───────────────────────────────────────────────────────┐  │
 │  │  routers/   transactions · categories · accounts ·    │  │
 │  │             credits · rules · dashboard               │  │
 │  ├───────────────────────────────────────────────────────┤  │
 │  │  services/  importer (xlsx/csv → rows)                │  │
 │  │             categorizer (rules → category/credit)     │  │
 │  ├───────────────────────────────────────────────────────┤  │
 │  │  database/  SQLAlchemy models + session factory       │  │
 │  └───────────────────────────────────────────────────────┘  │
 │                            │                                │
 │                            ▼                                │
 │              backend/euroly.db (SQLite)                     │
 └─────────────────────────────────────────────────────────────┘
```

Both processes are started by [`start.bat`](../start.bat). The bat file:

1. Creates `backend/.venv` and installs Python deps on first run.
2. Runs `npm install` in `frontend/` on first run.
3. Launches `uvicorn` in a new console window ("Euroly API").
4. Launches `vite` in a new console window ("Euroly UI").
5. Opens the browser at the frontend URL.

There's no reverse proxy, no Docker, no system service — closing either console window stops that half of the app.

## Layered backend

```
backend/
├── main.py                   ← FastAPI app + CORS + router mounting
├── database/
│   ├── db.py                 ← engine, SessionLocal, init_db, seed
│   └── models.py             ← SQLAlchemy ORM models
├── routers/                  ← HTTP layer — Pydantic DTOs, routes
│   ├── transactions.py
│   ├── categories.py
│   ├── accounts.py
│   ├── credits.py
│   ├── rules.py
│   └── dashboard.py
└── services/                 ← Domain logic — pure functions on a Session
    ├── importer.py           ← bank file parsing & dedupe
    └── categorizer.py        ← rule-driven auto-categorization
```

**Dependency direction:** `main` → `routers` → (`services`, `database`). Routers depend on services and on the ORM; services depend only on the ORM. The ORM doesn't import from routers or services.

Pydantic schemas live alongside their routers (no separate `schemas/` folder) — it's a small app and colocation keeps the request/response shape next to the code that uses it.

## Layered frontend

```
frontend/src/
├── main.jsx                  ← React bootstrap + BrowserRouter
├── App.jsx                   ← route table
├── api.js                    ← thin fetch wrapper + fmtEUR helper
├── components/               ← reusable presentational components
│   ├── Layout.jsx            ← sidebar + outlet
│   └── Card.jsx              ← KPI tile + Section panel
└── pages/                    ← one component per route, owns its data
    ├── Dashboard.jsx
    ├── Accounts.jsx
    ├── Credits.jsx
    ├── Transactions.jsx
    ├── Validation.jsx
    └── Backoffice.jsx
```

Pages are **container components**: they fetch, hold state, and pass plain data into `components/`. There's no global store, no React Query, no Redux — just `useState` + `useEffect`. The app is small enough that a fetch on mount is fine; re-fetches happen on user action (filter change, save, import).

Currency is formatted exclusively through `fmtEUR()` exported from `api.js`. All copy strings are Portuguese (the user-facing language); identifiers and code comments stay in English.

## Request lifecycle: a bank import

```
User picks a file in Transações page
       │
       ▼
  ImportDialog opens → user selects target Account
       │
       ▼
  api.importTransactions(file, accountId)
       │
       ▼  multipart/form-data
  POST /api/transactions/import
       │
       ▼
  routers/transactions.import_file()
       │
       ├─ verifies account exists
       │
       ▼
  services/importer.import_bank_file(db, file, account_id)
       │
       ├─ reads bytes (Excel or CSV) → pandas DataFrame
       ├─ normalizes column names (lowercase, strip)
       ├─ resolves which column is date / desc / amount / balance
       ├─ for each row:
       │     ├─ parses date, description, signed amount, balance
       │     ├─ checks dedupe key vs DB
       │     │   (account_id, date, description, amount, balance_after)
       │     └─ inserts new Transaction (is_validated=False)
       └─ returns {file, new, skipped}
       │
       ▼
  services/categorizer.apply_rules(db)
       │
       ├─ loads rules ORDER BY priority ASC
       ├─ for each uncategorized Transaction:
       │     ├─ walks rules
       │     ├─ first match wins
       │     └─ assigns category_id (and credit_id if rule has one)
       └─ commits
       │
       ▼
  Response: {file, new, skipped}
       │
       ▼
  Frontend refetches transactions and account list
```

See [IMPORT.md](IMPORT.md) for the import-side details and [RULES.md](RULES.md) for the categorizer.

## Data flow on the dashboard

```
Dashboard mounts
     │
     ├──▶ GET /api/accounts          (populate account selector)
     │
     ▼  (whenever month/year/accountId change)
  Promise.all([
     GET /api/dashboard/summary?month&year[&account_id]      ─▶ KPI cards
     GET /api/dashboard/by-month?year[&account_id]           ─▶ bar chart
     GET /api/dashboard/by-category?month&year[&account_id]  ─▶ pie chart
     GET /api/dashboard/savings-evolution[?account_id]       ─▶ line chart
  ])
```

All four queries exclude `is_transfer=True` rows on the backend — internal transfers between the user's own accounts would otherwise double-count.

## Privacy

This is a design constraint, not an aspiration. Euroly's repository is intended to be public; the data inside someone's installed copy is not.

**Implementation:**

- `Account` and `Credit` tables are **never seeded** with default rows. The user creates them via the Backoffice UI on first launch. No specific bank or creditor name is hardcoded anywhere in the source tree, tests, or docs.
- `backend/euroly.db` is in `.gitignore`. The default `Category` seed contains only generic PT names (Salário, Habitação, Energia, …) that say nothing about the user.
- The auto-categorization engine is description-based — bank line text is matched against user-defined rules, never against a built-in vendor dictionary.
- The user manual ([MANUAL.md](MANUAL.md)) uses placeholder names like "Conta Principal", "Crédito Pessoal".

If you fork this and want to add bundled defaults for a specific country's banks, do it as an **optional, opt-in seed file** that's gitignored — not in `_seed_defaults()`.

## Storage and lifecycle

- The only database is `backend/euroly.db`. Back it up by copying that file.
- There is no migration tool. When a schema change is shipped, the user must delete `euroly.db` before restarting — the default categories will be re-seeded, but accounts, credits and transactions are lost. This is acceptable for an early-stage personal-use app; if Euroly grows beyond that, Alembic should be wired in.
- Logs are not persisted. Uvicorn prints to its console window; closing the window discards them.

## What this app is NOT

- Not multi-user. There's no auth, no row-level security; anyone with access to the file system can read the DB.
- Not networked. The CORS allow-list is hardcoded to `localhost:5173` so the API isn't reachable from another machine on the LAN by default.
- Not real-time. Dashboards are point-in-time snapshots from the last fetch; no WebSockets, no SSE.
- Not a replacement for bookkeeping software. Euroly does not model double-entry, taxes, currency conversion, or investment tracking.
