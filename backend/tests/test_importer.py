"""Tests for services/importer.py.

Covers the three pieces most likely to break and most expensive to debug:
1. `_to_float` — locale-aware monetary parsing (PT vs US, currency stripping)
2. `_pick_column` — column-name resolver with exclusion + specificity
3. `import_bank_file` — end-to-end via mocked UploadFile, focused on dedupe
   and account-scoped insertion
"""
from __future__ import annotations

import io
from datetime import date

import pandas as pd
import pytest

from services.importer import (
    AMOUNT_CANDIDATES,
    BALANCE_CANDIDATES,
    DATE_CANDIDATES,
    DESC_CANDIDATES,
    VALUE_DATE_CANDIDATES,
    _normalize_columns,
    _parse_date,
    _pick_column,
    _resolve_amount,
    _to_float,
    import_bank_file,
)
from database import models


# ---------------------------------------------------------------------------
# _to_float — locale and currency handling
# ---------------------------------------------------------------------------


class TestToFloat:
    @pytest.mark.parametrize(
        "value, expected",
        [
            ("1234.56", 1234.56),
            ("1234,56", 1234.56),          # PT decimal comma
            ("1.234,56", 1234.56),         # PT thousands + decimal
            ("1,234.56", 1234.56),         # US thousands + decimal
            ("1.234.567,89", 1234567.89),  # PT large
            ("0,00", 0.0),
            ("-50,00", -50.0),
            ("€ 50.00", 50.0),             # currency stripped
            ("€1.234,56", 1234.56),
            ("  100  ", 100.0),            # whitespace
            (50, 50.0),
            (50.5, 50.5),
        ],
    )
    def test_parses(self, value, expected):
        assert _to_float(value) == pytest.approx(expected)

    @pytest.mark.parametrize("value", [None, "", "abc", "€", float("nan")])
    def test_returns_none_for_unparsable(self, value):
        assert _to_float(value) is None


# ---------------------------------------------------------------------------
# _pick_column — specificity, exclusion, substring matching
# ---------------------------------------------------------------------------


class TestPickColumn:
    def _df(self, *cols):
        return pd.DataFrame({c: [None] for c in cols})

    def test_exact_match_wins(self):
        df = self._df("descrição", "outra coisa")
        assert _pick_column(df, DESC_CANDIDATES) == "descrição"

    def test_substring_match_for_decorated_headers(self):
        # "Montante( EUR )" should resolve via the "montante" substring.
        df = _normalize_columns(self._df("Montante( EUR )", "Saldo"))
        assert _pick_column(df, AMOUNT_CANDIDATES) == "montante( eur )"

    def test_specificity_order_avoids_collision(self):
        # The candidate "valor" would naively match "data valor" before
        # "montante" got tested. We expect candidate-first iteration to
        # match "montante" to "montante( eur )" first.
        df = _normalize_columns(self._df("Data Operação", "Data valor", "Montante( EUR )"))
        assert _pick_column(df, AMOUNT_CANDIDATES) == "montante( eur )"

    def test_excluded_columns_are_skipped(self):
        df = _normalize_columns(self._df("Data Operação", "Data valor"))
        date_col = _pick_column(df, DATE_CANDIDATES)
        assert date_col == "data operação"
        # When date_col is already claimed, value_date_col must not grab it.
        value_date_col = _pick_column(df, VALUE_DATE_CANDIDATES, exclude={date_col})
        assert value_date_col == "data valor"

    def test_returns_none_when_no_candidate_matches(self):
        df = _normalize_columns(self._df("randomheader", "another"))
        assert _pick_column(df, DESC_CANDIDATES) is None

    def test_balance_candidate_substring(self):
        df = _normalize_columns(self._df("Saldo Contabilístico( EUR )"))
        assert _pick_column(df, BALANCE_CANDIDATES) == "saldo contabilístico( eur )"


# ---------------------------------------------------------------------------
# _parse_date — multiple input formats
# ---------------------------------------------------------------------------


class TestParseDate:
    @pytest.mark.parametrize(
        "value, expected",
        [
            ("2026-05-15", date(2026, 5, 15)),
            ("15/05/2026", date(2026, 5, 15)),
            ("15-05-2026", date(2026, 5, 15)),
            ("15.05.2026", date(2026, 5, 15)),
            ("2026/05/15", date(2026, 5, 15)),
            (date(2026, 5, 15), date(2026, 5, 15)),
        ],
    )
    def test_parses(self, value, expected):
        assert _parse_date(value) == expected

    @pytest.mark.parametrize("value", [None, "", "not a date", "13/13/2026"])
    def test_returns_none_for_unparsable(self, value):
        assert _parse_date(value) is None


# ---------------------------------------------------------------------------
# _resolve_amount — signed-amount column vs separate debit/credit columns
# ---------------------------------------------------------------------------


class TestResolveAmount:
    def test_signed_amount_negative_is_expense(self):
        row = pd.Series({"montante": -8.25})
        assert _resolve_amount(row, "montante", None, None) == (8.25, "expense")

    def test_signed_amount_positive_is_income(self):
        row = pd.Series({"montante": 1500.0})
        assert _resolve_amount(row, "montante", None, None) == (1500.0, "income")

    def test_debit_credit_columns(self):
        row = pd.Series({"debito": 0, "credito": 100.0})
        assert _resolve_amount(row, None, "debito", "credito") == (100.0, "income")
        row = pd.Series({"debito": 50.0, "credito": 0})
        assert _resolve_amount(row, None, "debito", "credito") == (50.0, "expense")

    def test_returns_none_when_no_value(self):
        row = pd.Series({"montante": None})
        amount, _ = _resolve_amount(row, "montante", None, None)
        assert amount is None


# ---------------------------------------------------------------------------
# import_bank_file — end-to-end with mocked UploadFile, focused on dedupe
# ---------------------------------------------------------------------------


class FakeUploadFile:
    """Minimal stand-in for FastAPI's UploadFile.

    The importer reads two attributes off the upload: `.filename` and
    `.file.read()`. We don't need anything else, and using the real class
    would drag async test machinery in for no payoff.
    """

    def __init__(self, filename: str, content: bytes):
        self.filename = filename
        self.file = io.BytesIO(content)


def _build_xlsx(rows):
    """Build an in-memory .xlsx with PT bank-export columns from a list of dicts."""
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    buf.seek(0)
    return buf.read()


class TestImportBankFile:
    def test_basic_import(self, seeded_db):
        db = seeded_db["db"]
        account_id = seeded_db["account"].id
        content = _build_xlsx([
            {"Data Operação": "15-05-2026", "Data valor": "15-05-2026",
             "Descrição": "Continente", "Montante( EUR )": -42.50, "Saldo Contabilístico( EUR )": 300.0},
            {"Data Operação": "16-05-2026", "Data valor": "16-05-2026",
             "Descrição": "Salário", "Montante( EUR )": 1500.0, "Saldo Contabilístico( EUR )": 1800.0},
        ])
        summary = import_bank_file(db, FakeUploadFile("test.xlsx", content), account_id=account_id)
        assert summary == {"file": "test.xlsx", "new": 2, "skipped": 0}

        txs = db.query(models.Transaction).order_by(models.Transaction.date).all()
        assert len(txs) == 2
        assert txs[0].description == "Continente"
        assert txs[0].amount == 42.50  # always positive
        assert txs[0].type == "expense"
        assert txs[0].account_id == account_id
        assert txs[1].type == "income"

    def test_reimport_dedupes_via_balance(self, seeded_db):
        """Two identical-day identical-amount rows with different
        balance_after must be treated as distinct (the canonical case for
        same-day same-amount transactions like two 5€ Betano payments)."""
        db = seeded_db["db"]
        account_id = seeded_db["account"].id
        content = _build_xlsx([
            {"Data Operação": "15-05-2026", "Data valor": "15-05-2026",
             "Descrição": "Betano Payment", "Montante( EUR )": -5.0, "Saldo Contabilístico( EUR )": 310.55},
            {"Data Operação": "15-05-2026", "Data valor": "15-05-2026",
             "Descrição": "Betano Payment", "Montante( EUR )": -5.0, "Saldo Contabilístico( EUR )": 315.55},
        ])
        # First import: both rows in.
        s1 = import_bank_file(db, FakeUploadFile("a.xlsx", content), account_id=account_id)
        assert s1["new"] == 2 and s1["skipped"] == 0

        # Re-import the same file: zero new, both skipped.
        s2 = import_bank_file(db, FakeUploadFile("a.xlsx", content), account_id=account_id)
        assert s2["new"] == 0 and s2["skipped"] == 2

        # The two transactions still exist as separate rows.
        txs = db.query(models.Transaction).filter_by(description="Betano Payment").all()
        assert len(txs) == 2
        assert {t.balance_after for t in txs} == {310.55, 315.55}

    def test_dedupe_is_per_account(self, seeded_db):
        """Identical rows imported into two different accounts must not
        collide — each account has its own dedupe namespace."""
        db = seeded_db["db"]
        other = models.Account(name="Segunda Conta", kind="checking")
        db.add(other)
        db.commit()
        db.refresh(other)

        content = _build_xlsx([
            {"Data Operação": "15-05-2026", "Data valor": "15-05-2026",
             "Descrição": "Continente", "Montante( EUR )": -42.50,
             "Saldo Contabilístico( EUR )": 100.0},
        ])
        import_bank_file(db, FakeUploadFile("a.xlsx", content), account_id=seeded_db["account"].id)
        import_bank_file(db, FakeUploadFile("a.xlsx", content), account_id=other.id)

        # Same physical row appears in BOTH accounts.
        assert db.query(models.Transaction).count() == 2

    def test_rejects_file_without_required_columns(self, seeded_db):
        from fastapi import HTTPException
        content = _build_xlsx([{"random": 1, "headers": 2}])
        with pytest.raises(HTTPException) as exc:
            import_bank_file(db=seeded_db["db"], file=FakeUploadFile("bad.xlsx", content),
                             account_id=seeded_db["account"].id)
        assert exc.value.status_code == 400
