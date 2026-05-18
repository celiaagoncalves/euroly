"""Tests for services/categorizer.py — the rule-driven auto-categorization.

Critical invariants exercised here:
- Lower `priority` wins (rules are walked in ascending priority order).
- First match wins (later rules don't override an earlier match).
- Manual edits are sticky: rows with a non-NULL `category_id` are never
  re-categorized.
- A rule with `credit_id` links the transaction to that credit.
- Successful matches flip `is_validated = True`.
- Every supported match_type works case-insensitively.
"""
from __future__ import annotations

from datetime import date

import pytest

from database import models
from services.categorizer import apply_rules, _matches


# ---------------------------------------------------------------------------
# _matches — pure matching helper
# ---------------------------------------------------------------------------


class TestMatches:
    @pytest.mark.parametrize(
        "description, keyword, match_type, expected",
        [
            # contains: case-insensitive, position-agnostic
            ("EDP Comercial Factura", "EDP", "contains", True),
            ("edp serviços", "EDP", "contains", True),
            ("Continente", "EDP", "contains", False),
            # exact: full string after strip, case-insensitive
            ("SALARIO", "salario", "exact", True),
            (" SALARIO ", "SALARIO", "exact", True),
            ("SALARIO EXTRA", "SALARIO", "exact", False),
            # startswith
            ("CREDOR-A DD 12345", "credor-a", "startswith", True),
            ("DD CREDOR-A 12345", "credor-a", "startswith", False),
            # regex
            ("FACT 12345", r"^FACT\s\d+$", "regex", True),
            ("FACT abc", r"^FACT\s\d+$", "regex", False),
            # invalid regex falls through to False rather than raising
            ("anything", "[invalid", "regex", False),
        ],
    )
    def test_match_semantics(self, description, keyword, match_type, expected):
        assert _matches(description, keyword, match_type) is expected


# ---------------------------------------------------------------------------
# Helpers for building test transactions/rules in the seeded DB.
# ---------------------------------------------------------------------------


def _make_tx(db, account, description, type_="expense", amount=10.0, category_id=None, credit_id=None):
    tx = models.Transaction(
        date=date(2026, 5, 15),
        description=description,
        amount=amount,
        type=type_,
        account_id=account.id,
        category_id=category_id,
        credit_id=credit_id,
        is_validated=False,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def _make_rule(db, keyword, category_id, *, match_type="contains", priority=100, credit_id=None):
    r = models.Rule(
        keyword=keyword,
        match_type=match_type,
        category_id=category_id,
        priority=priority,
        credit_id=credit_id,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# ---------------------------------------------------------------------------
# apply_rules — full categorizer behavior
# ---------------------------------------------------------------------------


class TestApplyRules:
    def test_basic_match_sets_category_and_validates(self, seeded_db):
        db = seeded_db["db"]
        tx = _make_tx(db, seeded_db["account"], "EDP Comercial Factura")
        _make_rule(db, keyword="EDP", category_id=seeded_db["cat_expense"].id)

        matched = apply_rules(db)
        db.refresh(tx)

        assert matched == 1
        assert tx.category_id == seeded_db["cat_expense"].id
        assert tx.is_validated is True

    def test_no_match_leaves_row_untouched(self, seeded_db):
        db = seeded_db["db"]
        tx = _make_tx(db, seeded_db["account"], "Random Description")
        _make_rule(db, keyword="EDP", category_id=seeded_db["cat_expense"].id)

        matched = apply_rules(db)
        db.refresh(tx)

        assert matched == 0
        assert tx.category_id is None
        assert tx.is_validated is False

    def test_lower_priority_wins(self, seeded_db):
        """When two rules could both match, the one with the lower priority
        number runs first and wins. The losing rule is silently skipped."""
        db = seeded_db["db"]
        # Pretend we have a Supermercado category for the specific match.
        supermercado = models.Category(name="Supermercado", type="expense", color="#000", icon="x")
        db.add(supermercado)
        db.commit()
        db.refresh(supermercado)

        tx = _make_tx(db, seeded_db["account"], "PAGAMENTO CONTINENTE COIMBRA")
        # Generic catch-all at default priority.
        _make_rule(db, keyword="PAGAMENTO", category_id=seeded_db["cat_expense"].id, priority=100)
        # Specific rule with LOWER priority — should win.
        _make_rule(db, keyword="CONTINENTE", category_id=supermercado.id, priority=50)

        apply_rules(db)
        db.refresh(tx)
        assert tx.category_id == supermercado.id

    def test_first_match_wins_within_same_priority(self, seeded_db):
        """At equal priority, the rule with the lower id wins (insertion order)."""
        db = seeded_db["db"]
        other_cat = models.Category(name="Outras", type="expense", color="#000", icon="x")
        db.add(other_cat)
        db.commit()
        db.refresh(other_cat)

        tx = _make_tx(db, seeded_db["account"], "EDP COMERCIAL")
        first = _make_rule(db, keyword="EDP", category_id=seeded_db["cat_expense"].id, priority=100)
        _make_rule(db, keyword="COMERCIAL", category_id=other_cat.id, priority=100)

        apply_rules(db)
        db.refresh(tx)
        assert tx.category_id == first.category_id

    def test_manual_assignments_are_sticky(self, seeded_db):
        """Transactions that already have a category_id are never overwritten."""
        db = seeded_db["db"]
        already_assigned_cat = seeded_db["cat_income"].id
        tx = _make_tx(
            db, seeded_db["account"], "EDP Comercial",
            category_id=already_assigned_cat,
        )
        _make_rule(db, keyword="EDP", category_id=seeded_db["cat_expense"].id)

        matched = apply_rules(db)
        db.refresh(tx)

        assert matched == 0
        assert tx.category_id == already_assigned_cat

    def test_credit_linkage_via_rule(self, seeded_db):
        """A rule with credit_id assigns BOTH category and credit on match."""
        db = seeded_db["db"]
        tx = _make_tx(db, seeded_db["account"], "DD CREDOR-A 12345")
        _make_rule(
            db,
            keyword="CREDOR-A",
            category_id=seeded_db["cat_credit"].id,
            credit_id=seeded_db["credit"].id,
        )

        apply_rules(db)
        db.refresh(tx)
        assert tx.category_id == seeded_db["cat_credit"].id
        assert tx.credit_id == seeded_db["credit"].id
        assert tx.is_validated is True

    def test_returns_count_of_matched_transactions(self, seeded_db):
        db = seeded_db["db"]
        _make_tx(db, seeded_db["account"], "EDP one")
        _make_tx(db, seeded_db["account"], "EDP two")
        _make_tx(db, seeded_db["account"], "Other thing")
        _make_rule(db, keyword="EDP", category_id=seeded_db["cat_expense"].id)

        assert apply_rules(db) == 2

    def test_no_rules_is_a_noop(self, seeded_db):
        db = seeded_db["db"]
        _make_tx(db, seeded_db["account"], "anything")
        assert apply_rules(db) == 0

    def test_idempotent_second_pass_does_nothing(self, seeded_db):
        """Once a transaction is categorized, re-running apply_rules with
        the same rules in place must not double-match (it would, in the
        worst case, flip categories around if the previous bug
        regressed)."""
        db = seeded_db["db"]
        tx = _make_tx(db, seeded_db["account"], "EDP Comercial")
        _make_rule(db, keyword="EDP", category_id=seeded_db["cat_expense"].id)

        first = apply_rules(db)
        second = apply_rules(db)
        db.refresh(tx)

        assert first == 1
        assert second == 0  # nothing to do — manual stickiness applies
        assert tx.category_id == seeded_db["cat_expense"].id
