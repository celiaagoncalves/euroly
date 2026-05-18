# Bank file import

> How [`backend/services/importer.py`](../backend/services/importer.py) turns a bank export into rows in `transactions`. Sister docs: [RULES.md](RULES.md) for what happens next.

## Supported formats

- `.xlsx`, `.xls` — parsed by `pandas.read_excel` via openpyxl.
- `.csv` — parsed by `pandas.read_csv`, with auto-detected encoding and separator.

The file must contain at least a date column and a description column. Everything else (amount layout, balance column, value date) has graceful fallbacks.

## End-to-end flow

```
upload bytes
    │
    ▼
detect file type by extension
    │
    ▼
read into pandas.DataFrame
    │
    ▼
normalize column names (lowercase, strip)
    │
    ▼
resolve which columns map to:
   date          (required)
   description   (required)
   value_date    (optional)
   amount        (optional, preferred)
   debit         (optional, fallback)
   credit        (optional, fallback)
   balance_after (optional)
    │
    ▼
for each row:
   parse date     (multiple formats)
   parse amount   (sign-aware, locale-aware)
   parse balance  (locale-aware)
   check dedupe key in DB
       skip if duplicate, else insert
    │
    ▼
commit and return {file, new, skipped}
```

## Column detection

The detector lives in `_pick_column` in `importer.py`. After normalizing all column names to lowercase, the function:

1. Looks for an **exact** match against a curated candidate list.
2. If none, falls back to **substring** match. Returns the first matching column in original column order.

The candidate lists are ordered most-specific-first to avoid false positives:

```python
DATE_CANDIDATES        = ["data operação", "data operacao", "data movimento", "data mov.", "date", "data"]
VALUE_DATE_CANDIDATES  = ["data valor"]
DESC_CANDIDATES        = ["descrição", "descricao", "description", "memo", "details", "detalhes"]
AMOUNT_CANDIDATES      = ["montante", "valor", "amount"]
DEBIT_CANDIDATES       = ["débito", "debito", "debit", "saída", "saida"]
CREDIT_CANDIDATES      = ["crédito", "credito", "credit", "entrada"]
BALANCE_CANDIDATES     = ["saldo contabilístico", "saldo contabilistico", "saldo", "balance"]
```

Common PT bank header variants like `"Montante( EUR )"` resolve via substring matching against `"montante"`.

If your bank uses a header these candidates miss, add it to the relevant list in `importer.py` — no other code changes needed.

## Amount resolution

There are two common bank export layouts:

**Layout A — single signed amount column:**

| Data Operação | Descrição | Montante ( EUR ) |
|---------------|-----------|------------------|
| 2026-05-15    | Pagamento | -8.25            |
| 2026-05-15    | Salário   | 1500.00          |

Negative → expense, positive → income. The absolute value is stored as `amount`, and `type` carries the sign.

**Layout B — separate debit and credit columns:**

| Data | Descrição | Débito | Crédito |
|------|-----------|--------|---------|
| 2026-05-15 | Pagamento | 8.25 | |
| 2026-05-15 | Salário | | 1500.00 |

The non-empty column wins. Both populated would be unusual; the importer prefers `credit` in that edge case but that's not a meaningful guarantee.

Rows whose amount comes back as `None` or `0` are silently skipped.

## Locale-tolerant number parsing

The `_to_float` helper handles four representations of the same value:

| Input          | Parsed |
|----------------|--------|
| `1234.56`      | `1234.56` |
| `1,234.56`     | `1234.56` (US) |
| `1.234,56`     | `1234.56` (PT) |
| `1234,56`      | `1234.56` (PT short) |
| `"€ 50.00"`    | `50.00` (currency / whitespace stripped) |

The rule: whichever of `,` or `.` is **rightmost** is treated as the decimal separator. Everything else is treated as a thousands separator and removed.

## Date parsing

`_parse_date` tries pandas `Timestamp` / `datetime` values first, then walks a list of common formats:

```
%Y-%m-%d   %d/%m/%Y   %d-%m-%Y   %d.%m.%Y   %Y/%m/%d
```

If none match, it falls back to `pandas.to_datetime(text, dayfirst=True)` which is permissive but PT-friendly. Rows whose date can't be parsed are silently skipped.

## CSV: encoding and separator

`_read_csv` tries every (encoding × separator) combination until one parses without raising:

```
encodings = ["utf-8", "utf-8-sig", "latin-1"]
seps      = [",", ";", "\t"]
```

This covers virtually every PT bank CSV the project has seen — BOM-prefixed UTF-8 with both `,` and `;` separators is common, and older exports occasionally use `latin-1`. If your file fails, open it in a text editor and check the actual delimiter / encoding; add it to the list above if it's something new.

## Dedupe

The dedupe key is:

```
(account_id, date, description, amount, balance_after)
```

Including `balance_after` is the critical piece. Without it, two same-day same-amount transactions with the same description (e.g. two `Betano Payment -5.00` on the same Friday) would collapse to one. The running balance from the bank disambiguates them (`310.55` vs `315.55`).

**Edge case:** if the source file doesn't expose a balance column, `balance_after` is NULL for every imported row. The dedupe still works for re-imports of the same file, but two genuinely-distinct same-amount-same-day rows from a balance-less export will collapse to one. The fix is to use a bank export that includes the running balance — most PT exports do.

The dedupe check is enforced in Python at insertion time, not by a UNIQUE constraint, because SQL `=` doesn't match NULL with NULL; we need to fall back to `IS NULL` explicitly when balance is missing.

## After import: auto-categorization

The same HTTP request that imports a file also runs `services.categorizer.apply_rules` — see [RULES.md](RULES.md). New rows arrive with `is_validated = False`; rules that match assign `category_id` (and optionally `credit_id`) but leave `is_validated` False. The user confirms them in the Validação page.

## What the importer does NOT do

- It does not infer the **type** (income/expense) from anything other than the amount sign.
- It does not infer the **account** — the user picks it on upload.
- It does not parse running text descriptions beyond storing them verbatim.
- It does not detect or auto-pair internal transfers between accounts. Mark them manually with the ↔ button in Transações.
- It does not validate that the running balance is consistent across imports — `balance_after` is purely a dedupe input.

## Adding a new bank format

If your bank's export uses different column names:

1. Open [`backend/services/importer.py`](../backend/services/importer.py).
2. Add the new headers (lowercase) to the relevant `*_CANDIDATES` list, more specific first.
3. Restart the backend; rerun the import.

If your bank uses a fundamentally different structure (XML, OFX, multi-row headers), `import_bank_file` is the function to fork.
