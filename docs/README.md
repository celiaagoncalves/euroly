# Documentation index

Welcome to the Euroly docs. Pick a starting point based on what you're trying to do.

## I'm using the app

→ [**Manual do utilizador (PT)**](MANUAL.md) — guia completo para o dia-a-dia: configurar contas e créditos, importar extratos, criar regras de categorização, ler o dashboard.

## I'm reading the code

| Doc | What's in it |
|-----|--------------|
| [Architecture](ARCHITECTURE.md) | How the pieces fit: processes, layers, request lifecycle, privacy design. Start here. |
| [Tech stack](TECH_STACK.md) | Every library used, with the reasoning. Includes choices that were considered and rejected. |
| [Data model](DATA_MODEL.md) | Tables, relationships, ER diagram, constraints, dedupe key, delete semantics. |
| [API reference](API.md) | Curated summary of every `/api/...` endpoint. Live OpenAPI at `http://localhost:8000/docs`. |

## I'm extending the app

| Doc | What's in it |
|-----|--------------|
| [Development guide](DEVELOPMENT.md) | Setup, day-to-day commands, conventions, how to add features. |
| [Testing](TESTING.md) | How to run the pytest suite, what's covered, how to add tests. |
| [Bank file import](IMPORT.md) | The xlsx/csv pipeline in detail: column detection, locale-aware numbers, dedupe, adding a new bank format. |
| [Categorization rules](RULES.md) | Match types, priority resolution, credit linking, preview, export/import. |

## Reading order suggestions

**"I want to understand the project."**
[`../README.md`](../README.md) → [Architecture](ARCHITECTURE.md) → [Tech stack](TECH_STACK.md) → [Data model](DATA_MODEL.md).

**"I want to use it."**
[`../README.md`](../README.md) → [Manual do utilizador](MANUAL.md).

**"I want to contribute / fork."**
[Architecture](ARCHITECTURE.md) → [Development guide](DEVELOPMENT.md) → [Data model](DATA_MODEL.md) → relevant deep-dive ([IMPORT.md](IMPORT.md) or [RULES.md](RULES.md)).

**"I just need API specs."**
[API reference](API.md) or the live Swagger UI at `http://localhost:8000/docs`.
