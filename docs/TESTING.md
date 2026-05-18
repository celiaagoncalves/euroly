# Testing

> Backend tests live in `backend/tests/`. They run against an in-memory SQLite database, isolated per-test, with no file I/O and no external dependencies. The full suite finishes in under three seconds.

## Running

From the project root:

```
cd backend
.venv\Scripts\python.exe -m pytest          # Windows
.venv/bin/python -m pytest                  # macOS / Linux
```

Or with the activated venv: `pytest`.

Common flags:

```
pytest -v                  # verbose names (default in pytest.ini)
pytest -x                  # stop at first failure
pytest -k pair             # only tests whose name matches "pair"
pytest tests/test_importer.py
pytest --collect-only      # list tests without running them
```

## What's covered

| File | Targets | Notable invariants |
|------|---------|--------------------|
| `tests/test_importer.py` | `services/importer.py` | Locale-aware monetary parsing (PT `1.234,56` vs US `1,234.56`); column resolver specificity + exclusion; dedupe key includes `balance_after`; dedupe is per-account; column-name + structural validation. |
| `tests/test_categorizer.py` | `services/categorizer.py` + the `_matches` helper | Match types (`contains`, `exact`, `startswith`, `regex`) are case-insensitive; invalid regex falls through to False rather than raising; lower priority runs first; first match wins; manual assignments are sticky; rules with `credit_id` link the transaction; `apply_rules` is idempotent. |
| `tests/test_pair_matching.py` | `GET /api/transactions/transfer-suggestions` via FastAPI TestClient | Exact and tolerance-based matching; max-days window enforcement; transfers and credit-linked rows excluded; greedy assignment (no row appears in two pairs); ranking is smallest amount-delta first, day-delta as tie-break. |

Total: **71 tests** as of v0.1.0.

## Architecture

`conftest.py` provides three fixtures:

- **`engine`** — a fresh `sqlite:///:memory:` engine with `Base.metadata.create_all` already run.
- **`db`** — a SQLAlchemy `Session` bound to that engine. The session is closed in teardown.
- **`client`** — a FastAPI `TestClient` with `get_db` overridden to yield the same `db` session, so route tests see whatever the test seeded.
- **`seeded_db`** — `db` plus a minimum set of categories, an account and a credit so tests don't have to repeat scaffolding. Uses generic placeholder names ("Conta Principal", "Empréstimo Demo", "Credor A") so no specific institution leaks into the repo (see [ARCHITECTURE.md#privacy](ARCHITECTURE.md#privacy)).

Each test gets its own DB — there is no shared state between tests, so they can run in any order or in parallel (we don't use `pytest-xdist` today, but the suite is parallel-safe).

## What's NOT tested

- **Frontend** — no Vitest / RTL suite yet. The components most worth covering are `TransferSuggestions` (state machine for fetch + ignore + mark-pair) and the `deferWithUndo` helper.
- **End-to-end** — no Playwright/Cypress. The TestClient tests cover the HTTP surface but don't exercise the React app.
- **Routers other than `/api/transactions/transfer-suggestions`** — CRUD on categories/accounts/credits/rules is straightforward and not currently covered. Add tests here when behavior gets non-trivial (e.g. cascading delete semantics, JSON rule export/import round-trips).
- **The migration helper** in `database/db.py::_migrate_add_columns` — covered implicitly because every test starts from a fresh schema, but the migration path itself isn't exercised.

## Bugs the tests have caught

- **`_parse_date("")` returned `NaT` instead of `None`** — `pandas.to_datetime` is too permissive on the empty string. Fixed by an early return on empty input and `errors="coerce"` on the pandas fallback.

## Adding new tests

Follow the existing patterns:

- One class per scenario group; methods are individual cases.
- Use `@pytest.mark.parametrize` for table-driven tests where the only variation is input/output values.
- Use `seeded_db` to skip account/credit setup boilerplate.
- Use placeholder names — see [Privacy invariants](DEVELOPMENT.md#privacy-invariants).
- For HTTP tests, use the `client` fixture and assert on JSON shapes; don't reach into the DB to check state when an endpoint response would tell you.
