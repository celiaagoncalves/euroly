# Categorization rules

> How `Rule`s drive the auto-categorization engine in [`backend/services/categorizer.py`](../backend/services/categorizer.py). Sister docs: [IMPORT.md](IMPORT.md), [DATA_MODEL.md](DATA_MODEL.md#rules).

## What a rule looks like

A rule is a (`keyword`, `match_type`) pair plus a target `category_id` and an optional `credit_id`:

| Field | Example | Notes |
|-------|---------|-------|
| `keyword` | `"EDP COMERCIAL"` | Pattern (case-insensitive) |
| `match_type` | `"contains"` | One of `contains`, `exact`, `startswith`, `regex` |
| `category_id` | `5` (Energia) | Required |
| `credit_id` | `2` (Sofá - Cofidis) | Optional |
| `priority` | `100` | Lower runs first |

In plain English: "When a transaction description contains `EDP COMERCIAL`, put it in the Energia category." Or, with `credit_id` set: "When the description contains `COFIDIS`, put it in Créditos AND mark it as a payment toward the Sofá loan."

## Match types

All four are case-insensitive. Description and keyword are lowercased before comparison.

| Type | Behavior | Example keyword | Matches |
|------|----------|-----------------|---------|
| `contains` | `keyword in description` | `EDP` | `"EDP COMERCIAL FACTURA 1234"`, `"edp serv univ"` |
| `exact` | `description.strip() == keyword.strip()` | `Pagamento Levantamento ATM` | only that exact string |
| `startswith` | `description.startswith(keyword)` | `COFIDIS` | `"COFIDIS DD ..."` but not `"DD COFIDIS ..."` |
| `regex` | `re.search(keyword, description, IGNORECASE)` | `^[A-Z]{3}\s\d+` | any pattern; invalid regex compiles to "matches nothing" |

`contains` covers ~95% of real bank descriptions. Reach for `regex` when you need word boundaries or to match digits.

## Priority and resolution

When the categorizer processes a transaction, it walks rules in order:

```sql
SELECT * FROM rules ORDER BY priority ASC, id ASC
```

The **first match wins**. Subsequent matching rules are not evaluated.

That means **specific rules need lower priority numbers than general ones**. Two examples:

**Conflicting priorities (wrong):**

```
priority 100, contains "PAGAMENTO"           → Outros
priority 100, contains "PAGAMENTO COFIDIS"   → Créditos (Cofidis)
```

Both have priority 100; "Outros" might win on tie-break (`id ASC`). The Cofidis rule never gets to run.

**Fixed:**

```
priority  50, contains "PAGAMENTO COFIDIS"   → Créditos (Cofidis)
priority 100, contains "PAGAMENTO"           → Outros
```

Now the specific Cofidis rule runs first and wins.

The Backoffice doesn't reorder rules visually; it just lets you set the priority number directly.

## When rules run

The categorizer is invoked **at the end of every import** (`POST /api/transactions/import`). It also runs implicitly any time you call it from code, but there's no UI button to "re-run all rules" — to recategorize, edit individual rows or clear their `category_id` and reimport.

Rules apply only to transactions where **`category_id IS NULL`**. A transaction with an existing category — set by the user, or by a previous import — is never overwritten. This makes manual edits sticky.

## Linking payments to credits

A rule with `credit_id` set acts as a two-for-one: when it matches, it assigns both the category AND links the transaction to the credit. This is the canonical way to track loan payments:

1. Create the credit in **Backoffice → Créditos** (e.g. "Sofá", creditor "Cofidis", total 1800 €, mensal 50 €, 36 prestações).
2. Find the bank line text for the monthly debit. Looking at your imported transactions, it might be `"DD COFIDIS XXXXXXXX"` or similar.
3. Create a rule in **Backoffice → Regras**:
   - keyword: `COFIDIS`
   - match type: `contains`
   - category: `Créditos` (or whatever you call your loans bucket)
   - **credit: `Sofá`**
   - priority: 50 (lower than the default 100, so it beats any catch-all)
4. On the next import (or any past one where these transactions still have `credit_id IS NULL`), every Cofidis line is automatically pinned to the Sofá credit.

The **Créditos** page then shows real progress: amount paid, installments paid, % done, and the list of linked payments.

## Preview before saving

`POST /api/rules/preview` runs a (keyword, match_type) pair against existing transactions and returns the count plus up to 50 sample matches — without saving anything. The Backoffice exposes this as a "Pré-visualizar" button on the new-rule form. Always preview before creating rules with broad keywords like `PAGAMENTO`.

## Quick-create from Validação

The Validação page has a "Guardar regra" checkbox on each pending row. When checked, validating that row creates a `contains` rule using the first three whitespace-separated tokens of the description as the keyword.

E.g. confirming `"EDP COMERCIAL FACTURA 1234"` as Energia with the checkbox on creates:

- keyword: `EDP COMERCIAL FACTURA`
- match_type: `contains`
- category_id: Energia
- priority: 100

This is a heuristic and often too specific (the factura number is in the keyword). Refine it in Backoffice → Regras: shorten the keyword to `EDP COMERCIAL`, or just `EDP`.

## Backup and migration: export / import JSON

`GET /api/rules/export` dumps all rules as JSON. Categories are referenced by **name** (not id), so the file is portable across machines / databases:

```json
{
  "rules": [
    { "keyword": "EDP", "match_type": "contains", "priority": 100, "category_name": "Energia" },
    { "keyword": "COFIDIS", "match_type": "contains", "priority": 50, "category_name": "Créditos" }
  ]
}
```

`POST /api/rules/import` reads such a file (upload as multipart). Rules referencing categories that don't exist locally are silently skipped — create the missing categories first.

Note: the JSON export does NOT include `credit_id` linkages. Credits are user-specific and not portable; re-add the credit_id manually after import.

## Limits

- Rules don't compose. A transaction is either matched by one rule (the highest-priority one that fits) or by none. You can't have one rule that sets the category and a separate rule that sets the credit_id — combine them into a single rule.
- Rules can't target a specific account. A keyword match applies regardless of which account the transaction belongs to.
- Rules can't be conditional on amount. If `RECEITA INESPERADA 5€` should bucket differently from `RECEITA INESPERADA 5000€`, you'll need two rules with different keywords or do it manually.

These limits are deliberate — they keep the engine predictable. If you outgrow them, the rule engine is `services/categorizer.py` and forks well.
