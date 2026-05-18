"""SQLAlchemy ORM models — the full domain in one file.

Relationships at a glance:

    Account 1───* Transaction *───1 Category
                        │
                        *───? Credit

A Transaction belongs to one Account (the bank/card it was posted to),
optionally to one Category (its budget bucket) and optionally to one
Credit (when it's a payment servicing a loan). Rules drive auto-assignment
of Category and Credit during import.
"""
from datetime import date, datetime
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship

from .db import Base


class Category(Base):
    """Budget bucket. Generic, language-agnostic — seeded with PT defaults."""

    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(80), nullable=False, unique=True)
    type = Column(String(10), nullable=False)  # income | expense
    color = Column(String(20), nullable=False, default="#64748b")
    icon = Column(String(40), nullable=False, default="circle")

    transactions = relationship("Transaction", back_populates="category")
    rules = relationship("Rule", back_populates="category", cascade="all, delete-orphan")


class Account(Base):
    """A bank/card account the user owns. NEVER seeded with default names.

    The user creates these via the Backoffice UI to keep personal info
    out of the repo. See CLAUDE.md / memory: project-euroly-overview.
    """

    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(80), nullable=False, unique=True)
    kind = Column(String(20), nullable=False, default="checking")  # checking | savings | card | wallet
    currency = Column(String(8), nullable=False, default="EUR")
    color = Column(String(20), nullable=False, default="#0ea5e9")
    icon = Column(String(40), nullable=False, default="wallet")
    initial_balance = Column(Float, nullable=False, default=0.0)
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="account")


class Credit(Base):
    """A loan or credit line the user is paying off. NEVER seeded.

    Transactions can be linked to a credit (credit_id) to be counted
    as payments servicing it.
    """

    __tablename__ = "credits"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)  # free-form, e.g. "Empréstimo Pessoal"
    creditor = Column(String(80), nullable=False)  # user-entered lender name
    total_amount = Column(Float, nullable=False)  # total to be repaid (principal + interest)
    monthly_payment = Column(Float, nullable=False)
    total_installments = Column(Integer, nullable=False)
    # For credits that started before tracking in Euroly: amount already
    # paid via installments that aren't in the transactions table. Added
    # to amount_paid in progress computation.
    paid_before_tracking = Column(Float, nullable=False, default=0.0)
    interest_rate = Column(Float, nullable=True)  # annual %, optional
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    color = Column(String(20), nullable=False, default="#a855f7")
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="credit")
    rules = relationship("Rule", back_populates="credit")


class Transaction(Base):
    """One row from a bank export — the core fact table.

    `amount` is always stored as a positive number; the sign of the
    movement lives in `type` (income | expense). This keeps reporting
    queries simple (SUM by type) at the cost of disallowing negative-value
    rows, which bank files don't produce anyway after our normalization.

    `balance_after` is the running account balance reported by the bank
    immediately after this transaction posted. We persist it for two
    reasons: (1) it disambiguates same-day same-amount duplicates during
    dedupe, and (2) it lets us verify our balance computation against the
    bank's source of truth.

    `is_transfer` flags moves between the user's own accounts so they can
    be excluded from income/expense totals on the dashboard (otherwise a
    €100 transfer would inflate both totals by €100).
    """

    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)  # "Data Operação" — when the bank posted it
    value_date = Column(Date, nullable=True)  # "Data valor" — when it affects available balance
    description = Column(String(500), nullable=False)
    amount = Column(Float, nullable=False)  # always positive; sign is in `type`
    type = Column(String(10), nullable=False)  # income | expense
    balance_after = Column(Float, nullable=True)  # running balance from bank; used for dedupe
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    credit_id = Column(Integer, ForeignKey("credits.id"), nullable=True)
    is_validated = Column(Boolean, nullable=False, default=False)  # user has confirmed the category
    is_transfer = Column(Boolean, nullable=False, default=False)  # excludes from income/expense totals
    source_file = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    credit = relationship("Credit", back_populates="transactions")


class Rule(Base):
    """Auto-categorization rule.

    During import, every uncategorized transaction is tested against every
    rule (ordered by `priority` ascending — lower wins) and stops at the
    first match. The rule assigns its `category_id` and, optionally, its
    `credit_id` to the transaction. Manual assignments are never
    overwritten — see `services/categorizer.apply_rules`.
    """

    __tablename__ = "rules"

    id = Column(Integer, primary_key=True, index=True)
    keyword = Column(String(200), nullable=False)
    match_type = Column(String(20), nullable=False, default="contains")  # contains | exact | startswith | regex
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    credit_id = Column(Integer, ForeignKey("credits.id"), nullable=True)  # optional: also link matched txs to a credit
    priority = Column(Integer, nullable=False, default=100)  # lower runs first
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    category = relationship("Category", back_populates="rules")
    credit = relationship("Credit", back_populates="rules")
