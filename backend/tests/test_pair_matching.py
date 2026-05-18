"""Tests for /api/transactions/transfer-suggestions — the pair detector.

Exercises the algorithm via the HTTP endpoint (with an injected in-memory
DB session) so we cover both the matching logic and the wiring.

Invariants under test:
- Exact-amount pairs match when within max_days.
- Tolerance > 0 broadens matching; amount delta in result.
- Already-flagged transfers and credit-linked rows are excluded.
- Each transaction appears in AT MOST one pair (greedy assignment).
- Ranking: smallest amount delta wins; tie-broken by smallest day delta.
- max_days is enforced.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from database import models


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _tx(db, account, *, date_, type_, amount, description="x", is_transfer=False, credit_id=None):
    t = models.Transaction(
        date=date_,
        description=description,
        amount=amount,
        type=type_,
        account_id=account.id,
        is_validated=True,
        is_transfer=is_transfer,
        credit_id=credit_id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def _call(client, **params):
    """Hit the endpoint and return the parsed JSON body."""
    res = client.get("/api/transactions/transfer-suggestions", params=params)
    assert res.status_code == 200, res.text
    return res.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPairMatching:
    def test_exact_same_day_pair(self, seeded_db, client):
        db, acc = seeded_db["db"], seeded_db["account"]
        d = date(2026, 5, 15)
        exp = _tx(db, acc, date_=d, type_="expense", amount=50.0, description="Mbway")
        inc = _tx(db, acc, date_=d, type_="income", amount=50.0, description="Reembolso")

        body = _call(client)
        assert body["count"] == 1
        pair = body["pairs"][0]
        assert pair["income"]["id"] == inc.id
        assert pair["expense"]["id"] == exp.id
        assert pair["days_apart"] == 0
        assert pair["amount_delta"] == 0.0

    def test_no_match_when_amounts_differ_and_tolerance_zero(self, seeded_db, client):
        db, acc = seeded_db["db"], seeded_db["account"]
        d = date(2026, 5, 15)
        _tx(db, acc, date_=d, type_="expense", amount=49.99)
        _tx(db, acc, date_=d, type_="income", amount=50.0)

        body = _call(client)
        assert body["count"] == 0

    def test_tolerance_broadens_match(self, seeded_db, client):
        db, acc = seeded_db["db"], seeded_db["account"]
        d = date(2026, 5, 15)
        exp = _tx(db, acc, date_=d, type_="expense", amount=49.99)
        inc = _tx(db, acc, date_=d, type_="income", amount=50.0)

        body = _call(client, amount_tolerance=0.5)
        assert body["count"] == 1
        pair = body["pairs"][0]
        assert pair["income"]["id"] == inc.id
        assert pair["expense"]["id"] == exp.id
        assert pair["amount_delta"] == pytest.approx(0.01)

    def test_max_days_window_enforced(self, seeded_db, client):
        db, acc = seeded_db["db"], seeded_db["account"]
        d = date(2026, 5, 15)
        _tx(db, acc, date_=d, type_="expense", amount=50.0)
        _tx(db, acc, date_=d + timedelta(days=10), type_="income", amount=50.0)

        # Default max_days=7 → no pair
        assert _call(client)["count"] == 0
        # Widen to 14 → match
        assert _call(client, max_days=14)["count"] == 1

    def test_already_transfer_rows_are_excluded(self, seeded_db, client):
        """Transactions previously flagged as transfer must not be suggested
        again — they're already handled."""
        db, acc = seeded_db["db"], seeded_db["account"]
        d = date(2026, 5, 15)
        _tx(db, acc, date_=d, type_="expense", amount=50.0, is_transfer=True)
        _tx(db, acc, date_=d, type_="income", amount=50.0, is_transfer=True)

        assert _call(client)["count"] == 0

    def test_credit_linked_rows_are_excluded(self, seeded_db, client):
        """Transactions paying off a credit are real payments, not transfers."""
        db, acc, credit = seeded_db["db"], seeded_db["account"], seeded_db["credit"]
        d = date(2026, 5, 15)
        _tx(db, acc, date_=d, type_="expense", amount=50.0, credit_id=credit.id)
        _tx(db, acc, date_=d, type_="income", amount=50.0)

        assert _call(client)["count"] == 0

    def test_each_row_appears_in_at_most_one_pair(self, seeded_db, client):
        """Greedy match must not double-use a row when multiple candidates fit."""
        db, acc = seeded_db["db"], seeded_db["account"]
        d = date(2026, 5, 15)
        _tx(db, acc, date_=d, type_="expense", amount=50.0)
        _tx(db, acc, date_=d, type_="income", amount=50.0)
        _tx(db, acc, date_=d, type_="income", amount=50.0)  # extra income with no matching expense

        body = _call(client)
        assert body["count"] == 1
        # Only one of the two incomes is paired; the other is left over.

    def test_ranking_smaller_amount_delta_wins(self, seeded_db, client):
        """With two candidates that both fit the tolerance, the one with
        the smaller amount delta should win even if it's further in time."""
        db, acc = seeded_db["db"], seeded_db["account"]
        # Income on day 10
        inc = _tx(db, acc, date_=date(2026, 5, 10), type_="income", amount=50.0)
        # Expense 1: same-day but 0.50€ off  → amount_delta=0.50, days=0
        exp_close_day_far_amt = _tx(db, acc, date_=date(2026, 5, 10), type_="expense", amount=49.50)
        # Expense 2: 5 days away but exact   → amount_delta=0.00, days=5
        exp_far_day_exact_amt = _tx(db, acc, date_=date(2026, 5, 5), type_="expense", amount=50.0)

        body = _call(client, amount_tolerance=1.0, max_days=14)
        assert body["count"] == 1
        pair = body["pairs"][0]
        # Exact amount should win over closer date
        assert pair["expense"]["id"] == exp_far_day_exact_amt.id
        assert pair["income"]["id"] == inc.id
        assert pair["amount_delta"] == 0.0
        assert pair["days_apart"] == 5

    def test_ranking_amount_tie_broken_by_days(self, seeded_db, client):
        """When two candidates have the same amount delta, the one closer in time wins."""
        db, acc = seeded_db["db"], seeded_db["account"]
        inc = _tx(db, acc, date_=date(2026, 5, 10), type_="income", amount=50.0)
        # Both candidates have exact amounts. Day-2 is closer than day-5.
        exp_closer = _tx(db, acc, date_=date(2026, 5, 8), type_="expense", amount=50.0)
        _tx(db, acc, date_=date(2026, 5, 5), type_="expense", amount=50.0)

        body = _call(client, max_days=14)
        assert body["count"] == 1
        assert body["pairs"][0]["expense"]["id"] == exp_closer.id

    def test_response_metadata(self, seeded_db, client):
        body = _call(client, max_days=10, amount_tolerance=2.5)
        assert body["max_days"] == 10
        assert body["amount_tolerance"] == 2.5
        assert "pairs" in body
        assert isinstance(body["pairs"], list)
