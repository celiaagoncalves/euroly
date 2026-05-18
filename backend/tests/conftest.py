"""Shared pytest fixtures.

Each test gets a **fresh in-memory SQLite database** — no shared state
between tests, no file I/O. The `db` fixture yields a SQLAlchemy Session
bound to that fresh database, and `seeded_db` adds a minimum set of
categories/accounts/credits so tests don't have to repeat scaffolding.

We deliberately bypass the production `database.db` module's global
engine: instead we build a per-test engine from scratch and create all
tables on it. The production code's session-factory pattern still works
because every router takes `db: Session = Depends(get_db)` and our
service-layer code takes a `Session` argument explicitly — neither
imports the global session.
"""
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Make `backend/` importable as the top-level package root so
# `from database...` and `from services...` work the same way they do
# under uvicorn (which uses --app-dir backend).
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.db import Base  # noqa: E402
from database import models  # noqa: E402, F401 — registers models on Base


@pytest.fixture
def engine():
    """In-memory SQLite engine, fresh per test."""
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    """Session bound to the per-test in-memory DB."""
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    """FastAPI TestClient backed by the per-test in-memory DB.

    We override `get_db` so route handlers reuse the same session as the
    test, which lets the test seed data through SQLAlchemy directly and
    then exercise routes that see those rows.
    """
    from fastapi.testclient import TestClient
    from main import app
    from database.db import get_db

    def _override():
        try:
            yield db
        finally:
            pass  # the outer `db` fixture handles cleanup

    app.dependency_overrides[get_db] = _override
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def seeded_db(db):
    """`db` plus a minimal set of categories, an account and a credit so tests
    can build transactions without repeating the scaffolding."""
    cat_expense = models.Category(name="Despesas", type="expense", color="#000", icon="x")
    cat_income = models.Category(name="Rendimento", type="income", color="#000", icon="x")
    cat_credit = models.Category(name="Créditos", type="expense", color="#a855f7", icon="cc")
    db.add_all([cat_expense, cat_income, cat_credit])
    account = models.Account(name="Conta Principal", kind="checking", initial_balance=0.0)
    db.add(account)
    credit = models.Credit(
        name="Empréstimo Demo",
        creditor="Credor A",
        total_amount=1200.0,
        monthly_payment=50.0,
        total_installments=24,
    )
    db.add(credit)
    db.commit()
    db.refresh(cat_expense)
    db.refresh(cat_income)
    db.refresh(cat_credit)
    db.refresh(account)
    db.refresh(credit)
    return {
        "db": db,
        "cat_expense": cat_expense,
        "cat_income": cat_income,
        "cat_credit": cat_credit,
        "account": account,
        "credit": credit,
    }
