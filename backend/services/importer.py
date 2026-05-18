"""Bank file (Excel / CSV) parser.

Goals:
- Tolerate the wild variation of column names across PT bank exports.
- Tolerate locale quirks (PT decimals `1.234,56` vs US `1,234.56`).
- Never insert the same row twice across re-imports.

The candidate lists below are ordered by specificity: more specific
labels first so substring fallback matching doesn't accidentally pick
the wrong column (e.g. "Data valor" before "Data" would match either
"Data Operação" or "Data valor" depending on column order).
"""
from __future__ import annotations

import io
from datetime import datetime, date
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import models


# Candidates are matched case-insensitively after stripping. The picker
# tries exact match first, then substring match — so "data" still finds
# "data operação" when needed.
DATE_CANDIDATES = [
    "data operação", "data operacao", "data movimento", "data mov.",
    "date", "data",
]
VALUE_DATE_CANDIDATES = ["data valor"]
DESC_CANDIDATES = ["descrição", "descricao", "description", "memo", "details", "detalhes"]
AMOUNT_CANDIDATES = ["montante", "valor", "amount"]
# Some banks (older Millennium exports) split debits/credits into two
# columns instead of a signed amount column — handled as a fallback.
DEBIT_CANDIDATES = ["débito", "debito", "debit", "saída", "saida"]
CREDIT_CANDIDATES = ["crédito", "credito", "credit", "entrada"]
BALANCE_CANDIDATES = ["saldo contabilístico", "saldo contabilistico", "saldo", "balance"]


def import_bank_file(db: Session, file: UploadFile, account_id: int) -> dict:
    """Parse an uploaded bank file and insert new transactions for the given account.

    Returns `{file, new, skipped}`. Skipped = rows that already exist in
    the DB (same account + date + description + amount + balance_after).
    Raises HTTPException(400) for malformed files or missing required columns.
    """
    name = file.filename or "upload"
    suffix = Path(name).suffix.lower()

    raw = file.file.read()
    if not raw:
        raise HTTPException(400, "Empty file")

    try:
        if suffix in {".xlsx", ".xls"}:
            df = pd.read_excel(io.BytesIO(raw))
        elif suffix == ".csv":
            df = _read_csv(raw)
        else:
            raise HTTPException(400, "Unsupported file type. Use .xlsx, .xls or .csv")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, f"Could not parse file: {exc}")

    df = _normalize_columns(df)
    date_col = _pick_column(df, DATE_CANDIDATES)
    desc_col = _pick_column(df, DESC_CANDIDATES)
    if not date_col or not desc_col:
        raise HTTPException(400, "File must contain date and description columns")

    value_date_col = _pick_column(df, VALUE_DATE_CANDIDATES)
    amount_col = _pick_column(df, AMOUNT_CANDIDATES)
    debit_col = _pick_column(df, DEBIT_CANDIDATES)
    credit_col = _pick_column(df, CREDIT_CANDIDATES)
    balance_col = _pick_column(df, BALANCE_CANDIDATES)

    new_count = 0
    skipped = 0

    for _, row in df.iterrows():
        tx_date = _parse_date(row.get(date_col))
        description = str(row.get(desc_col) or "").strip()
        if not tx_date or not description:
            continue

        amount, tx_type = _resolve_amount(row, amount_col, debit_col, credit_col)
        if amount is None or amount == 0:
            continue

        value_date = _parse_date(row.get(value_date_col)) if value_date_col else None
        balance_after = _to_float(row.get(balance_col)) if balance_col else None

        # Dedupe key: account + date + description + amount + balance_after.
        # Including balance_after distinguishes legitimately-identical
        # same-day same-amount rows (e.g. two €5 Betano payments today
        # leave different running balances).
        q = db.query(models.Transaction).filter(
            models.Transaction.account_id == account_id,
            models.Transaction.date == tx_date,
            models.Transaction.description == description,
            models.Transaction.amount == amount,
        )
        if balance_after is None:
            # SQL `=` doesn't match NULLs, so use IS NULL explicitly when
            # the incoming row has no balance. Two balance-less identical
            # rows will still collapse — acceptable tradeoff.
            q = q.filter(models.Transaction.balance_after.is_(None))
        else:
            q = q.filter(models.Transaction.balance_after == balance_after)
        if q.first():
            skipped += 1
            continue

        db.add(
            models.Transaction(
                date=tx_date,
                value_date=value_date,
                description=description,
                amount=amount,
                type=tx_type,
                balance_after=balance_after,
                account_id=account_id,
                is_validated=False,
                source_file=name,
            )
        )
        new_count += 1

    db.commit()
    return {"file": name, "new": new_count, "skipped": skipped}


def _read_csv(raw: bytes) -> pd.DataFrame:
    """Brute-force CSV decoder: try every (encoding, separator) combo.

    PT bank CSVs ship as utf-8, utf-8-sig (with BOM), or latin-1, and
    use either `,` or `;` as separator. Rather than guess, we try them
    all and return the first that parses without raising. `\t` covers
    the occasional TSV export.
    """
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        for sep in (",", ";", "\t"):
            try:
                return pd.read_csv(io.BytesIO(raw), encoding=encoding, sep=sep)
            except Exception:
                continue
    raise HTTPException(400, "Could not decode CSV file")


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df


def _pick_column(df: pd.DataFrame, candidates: list[str]) -> Optional[str]:
    """Two-pass column resolver. Exact match wins; substring fallback handles
    decorated headers like "Montante( EUR )" matching the candidate "montante".
    """
    # Pass 1: exact (post-normalization) match.
    for c in df.columns:
        if c in candidates:
            return c
    # Pass 2: substring match, in column order — so when multiple columns
    # are compatible (e.g. "data operação" and "data valor" both contain
    # "data"), we return whichever appears first in the file. The
    # candidate ordering above puts more specific entries first.
    for c in df.columns:
        for cand in candidates:
            if cand in c:
                return c
    return None


def _parse_date(value) -> Optional[date]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:
        return pd.to_datetime(text, dayfirst=True).date()
    except Exception:
        return None


def _to_float(value) -> Optional[float]:
    """Parse a monetary value tolerating PT and US numeric locales.

    Rules:
    - "1.234,56" (PT) -> 1234.56  (thousands `.`, decimal `,`)
    - "1,234.56" (US) -> 1234.56  (thousands `,`, decimal `.`)
    - "1234,56"       -> 1234.56  (no thousands separator)
    - "€ 50.00"       -> 50.00    (strips currency symbol and spaces)

    The locale is inferred from the *position* of the last `,` vs `.` —
    whichever appears rightmost is treated as the decimal separator.
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("€", "").replace(" ", "")
    if not text:
        return None
    if "," in text and "." in text:
        # Both separators present: whichever is rightmost is the decimal.
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        # Only a comma — assume PT decimal.
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _resolve_amount(row, amount_col, debit_col, credit_col):
    """Return (positive_amount, "income"|"expense") for a single row.

    We accept two layouts:
    - Single signed amount column ("Montante") — negative is expense.
    - Separate debit/credit columns — both positive, but only one is set.
    Bank exports rarely mix the two; if neither yields a usable number,
    we return None so the caller skips the row.
    """
    if amount_col:
        v = _to_float(row.get(amount_col))
        if v is None:
            return None, "expense"
        if v < 0:
            return abs(v), "expense"
        return v, "income"

    debit = _to_float(row.get(debit_col)) if debit_col else None
    credit = _to_float(row.get(credit_col)) if credit_col else None
    if credit and credit > 0:
        return credit, "income"
    if debit and debit > 0:
        return debit, "expense"
    return None, "expense"
