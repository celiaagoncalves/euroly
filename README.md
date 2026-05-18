# Euroly

> Personal budget tracker that runs entirely on your machine. Import bank exports, auto-categorize, track loans, see where your money goes — without uploading a single transaction to anyone's server.

Euroly is a local-only full-stack web app for managing monthly finances. It runs a FastAPI backend against a SQLite database and serves a React UI in your browser. There are no cloud services, no accounts, no telemetry. Your `euroly.db` file is the whole database.

## Features

- **Multi-account** — track several bank accounts, savings, cards and e-money wallets side by side.
- **Bank export import** — drop in `.xlsx` or `.csv` files from your bank; columns are auto-detected for typical Portuguese formats.
- **Auto-categorization** — define keyword rules once, and future imports categorize themselves.
- **Credit / loan tracking** — model each loan with its total, monthly payment and term; payments are linked automatically via rules.
- **Validation queue** — review and confirm anything the auto-categorizer couldn't match.
- **Cross-account dashboard** — KPIs, monthly bars, category pie, savings line. Filter by account or see the global view.
- **Smart dedupe** — re-importing the same file is safe; the running balance disambiguates same-day same-amount transactions.

## Quick start (Windows)

```
git clone https://github.com/celiaagoncalves/euroly.git
cd euroly
start.bat
```

On first run [`start.bat`](start.bat) creates a Python venv, installs backend dependencies, runs `npm install` for the frontend, then opens [http://localhost:5173](http://localhost:5173) in your browser. Subsequent runs are instant.

Requirements: Python 3.11+, Node.js 18+.

## Documentation

- [Manual do utilizador (PT)](docs/MANUAL.md) — how to use the app, day-to-day.
- [Architecture](docs/ARCHITECTURE.md) — system overview, layers, data flow.
- [Tech stack](docs/TECH_STACK.md) — what's used and why.
- [Data model](docs/DATA_MODEL.md) — entities, relationships, key constraints.
- [API reference](docs/API.md) — every endpoint with examples.
- [Bank file import](docs/IMPORT.md) — how column detection, locale parsing and dedupe work.
- [Categorization rules](docs/RULES.md) — the auto-categorization engine in detail.
- [Development guide](docs/DEVELOPMENT.md) — local setup, conventions, contributing.

Full docs index: [`docs/`](docs/README.md).

## Privacy

Euroly is designed to leak nothing. Personal data (account names, creditors, transactions) lives only in `backend/euroly.db`, which is gitignored. No bank or creditor names are hardcoded in the source — you add them via the Backoffice UI on first launch. See [docs/ARCHITECTURE.md#privacy](docs/ARCHITECTURE.md#privacy) for the rationale.

## Issues and contributing

Repository: [github.com/celiaagoncalves/euroly](https://github.com/celiaagoncalves/euroly). File bugs and feature requests in the [issue tracker](https://github.com/celiaagoncalves/euroly/issues). For setup and conventions, see the [development guide](docs/DEVELOPMENT.md).

## License

MIT — see [LICENSE](LICENSE).
