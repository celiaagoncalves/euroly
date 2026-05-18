# API reference

> All routes are mounted under `/api`. The backend listens on `http://localhost:8000`; the frontend reaches it through Vite's `/api` proxy. The live, auto-generated OpenAPI spec is served at [`/docs`](http://localhost:8000/docs) (Swagger UI) and [`/redoc`](http://localhost:8000/redoc) (ReDoc) — this file is a curated summary.

## Conventions

- Request and response bodies are JSON unless otherwise noted.
- File upload uses `multipart/form-data`.
- Error responses are FastAPI's default: `{"detail": "..."}` with the appropriate 4xx / 5xx code.
- `id` paths are integers.
- Filters via query string skip empty values: `?month=` is treated the same as omitting the param.

## Health

### `GET /api/health`

Liveness probe. Returns `{"status": "ok"}` if the process is up.

---

## Transactions

### `GET /api/transactions`

List transactions, with filters.

**Query params** (all optional):

| Param | Type | Notes |
|-------|------|-------|
| `month` | int 1..12 | |
| `year` | int 2000..2100 | |
| `account_id` | int | |
| `category_id` | int | |
| `credit_id` | int | |
| `type` | `income` \| `expense` | |
| `validated` | bool | |
| `is_transfer` | bool | |
| `search` | string | Case-insensitive substring of `description` |

**Response:** array of transactions including denormalized `account_name`, `category_name`, `credit_name`.

### `GET /api/transactions/pending`

Same shape as above, filtered to `is_validated = False`. Powers the Validação page.

### `PATCH /api/transactions/{id}`

Partial update. Any subset of these fields:

```json
{
  "category_id": 4,
  "credit_id": 2,
  "account_id": 1,
  "is_validated": true,
  "is_transfer": false,
  "description": "..."
}
```

### `DELETE /api/transactions/{id}`

Removes a single transaction.

### `POST /api/transactions/import`

Upload an `.xlsx` or `.csv` bank export.

**Form fields** (multipart):

| Field | Notes |
|-------|-------|
| `file` | The bank export, required |
| `account_id` | int, required — which account these rows belong to |

**Response:**

```json
{ "file": "extrato.xlsx", "new": 42, "skipped": 3 }
```

The same request also runs `apply_rules`, so newly-imported transactions may come back already categorized. See [IMPORT.md](IMPORT.md) for the parsing pipeline.

---

## Categories

### `GET /api/categories`

List categories. Optional `?type=income|expense`.

### `POST /api/categories`

Create. Body:

```json
{
  "name": "Energia",
  "type": "expense",
  "color": "#f97316",
  "icon": "zap"
}
```

### `PATCH /api/categories/{id}`

Full replacement of editable fields (same shape as `POST`).

### `DELETE /api/categories/{id}`

Removes a category. Transactions referencing it have their `category_id` set to NULL and `is_validated` flipped back to False so they reappear in the validation queue. Rules attached to the category cascade-delete.

---

## Accounts

### `GET /api/accounts`

List accounts. Optional `?active_only=true`.

**Response items** include computed `current_balance` and `transaction_count`:

```json
{
  "id": 1,
  "name": "Conta Principal",
  "kind": "checking",
  "currency": "EUR",
  "color": "#0ea5e9",
  "icon": "wallet",
  "initial_balance": 1500.0,
  "is_active": true,
  "notes": null,
  "current_balance": 1734.55,
  "transaction_count": 87
}
```

### `POST /api/accounts`

Create. `name` must be unique.

```json
{
  "name": "Conta Principal",
  "kind": "checking",
  "currency": "EUR",
  "color": "#0ea5e9",
  "icon": "wallet",
  "initial_balance": 1500.0,
  "is_active": true
}
```

### `PATCH /api/accounts/{id}`

Full replacement.

### `DELETE /api/accounts/{id}`

Removes the account; nulls `account_id` on its transactions (they're not deleted).

---

## Credits

### `GET /api/credits`

List credits with computed progress. Optional `?active_only=true`.

**Response items:**

```json
{
  "id": 1,
  "name": "Sofá",
  "creditor": "Cofidis",
  "total_amount": 1800.0,
  "monthly_payment": 50.0,
  "total_installments": 36,
  "interest_rate": 11.2,
  "start_date": "2025-01-15",
  "end_date": "2027-12-15",
  "is_active": true,
  "color": "#a855f7",
  "amount_paid": 200.0,
  "amount_remaining": 1600.0,
  "installments_paid": 4,
  "installments_remaining": 32,
  "progress_pct": 11.11,
  "last_payment_date": "2025-04-15"
}
```

### `GET /api/credits/{id}`

Same shape as the list item, for a single credit.

### `GET /api/credits/{id}/transactions`

Every transaction linked to this credit (its payment history), ordered most recent first.

### `POST /api/credits`

Create.

```json
{
  "name": "Sofá",
  "creditor": "Cofidis",
  "total_amount": 1800.0,
  "monthly_payment": 50.0,
  "total_installments": 36,
  "interest_rate": 11.2,
  "start_date": "2025-01-15",
  "end_date": "2027-12-15"
}
```

### `PATCH /api/credits/{id}`

Full replacement.

### `DELETE /api/credits/{id}`

Removes the credit; nulls `credit_id` on linked transactions.

---

## Rules

### `GET /api/rules`

List rules, ordered by `priority ASC` then `id ASC`.

### `POST /api/rules`

Create.

```json
{
  "keyword": "COFIDIS",
  "match_type": "contains",
  "category_id": 7,
  "credit_id": 1,
  "priority": 100
}
```

`credit_id` is optional. See [RULES.md](RULES.md) for matching semantics.

### `PATCH /api/rules/{id}`

Full replacement.

### `DELETE /api/rules/{id}`

Removes a single rule.

### `POST /api/rules/preview`

Test a (keyword, match_type) pair against existing transactions without saving.

```json
{ "keyword": "EDP", "match_type": "contains" }
```

**Response:**

```json
{
  "count": 12,
  "transactions": [
    { "id": 412, "date": "2026-04-03", "description": "EDP COMERCIAL FACTURA 1234", "amount": 67.43 },
    ...
  ]
}
```

The `transactions` array is capped at 50 entries.

### `GET /api/rules/{id}/preview`

Same as above, but uses the stored rule.

### `GET /api/rules/export`

Dump all rules as JSON with categories referenced by **name** (so the file is portable across machines).

```json
{
  "rules": [
    { "keyword": "EDP", "match_type": "contains", "priority": 100, "category_name": "Energia" }
  ]
}
```

### `POST /api/rules/import`

Upload a JSON file produced by `/api/rules/export` (or hand-edited). Categories are resolved by name; rules referencing categories that don't exist locally are silently skipped.

---

## Dashboard

All four endpoints automatically exclude `is_transfer = True` rows. They all accept an optional `account_id` filter; when omitted, they aggregate across every account.

### `GET /api/dashboard/summary`

Headline KPIs for a given month.

**Query:** `month`, `year`, `account_id` (all optional).

**Response:**

```json
{
  "month": 5,
  "year": 2026,
  "account_id": null,
  "total_income": 2400.0,
  "total_expenses": 1820.45,
  "savings": 579.55,
  "savings_rate": 24.15
}
```

### `GET /api/dashboard/by-month`

Per-month bars for the year-wide chart.

**Query:** `year`, `account_id` (optional).

**Response:** array of `{period: "YYYY-MM", income, expense, savings}`.

### `GET /api/dashboard/by-category`

Spend or income broken down by category for a given period.

**Query:** `month`, `year`, `type` (`income` | `expense`, defaults to `expense`), `account_id` (optional).

**Response:** array of `{category_id, name, color, total}` ordered by descending total.

### `GET /api/dashboard/savings-evolution`

Cumulative and per-month savings line for the whole history.

**Query:** `account_id` (optional).

**Response:** array of `{period, savings, cumulative_savings}`.
