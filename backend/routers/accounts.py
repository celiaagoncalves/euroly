"""/api/accounts — CRUD over the user's bank accounts and cards.

Listing accounts also returns `current_balance` (computed on the fly as
initial_balance + sum(income) − sum(expense)) and `transaction_count`,
so the Contas page can render rich cards in a single request.

Deleting an account does NOT cascade to transactions — it nulls their
`account_id`. The user can reassign them later or filter them out.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from database.db import get_db
from database import models

router = APIRouter()


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: str = Field(default="checking", pattern="^(checking|savings|card|wallet)$")
    currency: str = "EUR"
    color: str = "#0ea5e9"
    icon: str = "wallet"
    initial_balance: float = 0.0
    is_active: bool = True
    notes: Optional[str] = None


class AccountOut(AccountIn):
    id: int

    class Config:
        from_attributes = True


class AccountWithBalance(AccountOut):
    current_balance: float
    transaction_count: int


def _compute_balance(db: Session, account: models.Account) -> tuple[float, int]:
    """Return (current_balance, transaction_count) for an account.

    Computed from scratch each call — fine for tens of accounts × tens of
    thousands of transactions. If this becomes a hot path, cache or move
    to a materialized view.
    """
    income = (
        db.query(func.coalesce(func.sum(models.Transaction.amount), 0.0))
        .filter(
            models.Transaction.account_id == account.id,
            models.Transaction.type == "income",
        )
        .scalar()
        or 0.0
    )
    expense = (
        db.query(func.coalesce(func.sum(models.Transaction.amount), 0.0))
        .filter(
            models.Transaction.account_id == account.id,
            models.Transaction.type == "expense",
        )
        .scalar()
        or 0.0
    )
    count = (
        db.query(func.count(models.Transaction.id))
        .filter(models.Transaction.account_id == account.id)
        .scalar()
        or 0
    )
    return round(account.initial_balance + income - expense, 2), int(count)


@router.get("", response_model=list[AccountWithBalance])
def list_accounts(active_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(models.Account)
    if active_only:
        q = q.filter(models.Account.is_active.is_(True))
    accs = q.order_by(models.Account.name).all()
    result = []
    for a in accs:
        balance, count = _compute_balance(db, a)
        data = AccountOut.model_validate(a).model_dump()
        result.append(AccountWithBalance(**data, current_balance=balance, transaction_count=count))
    return result


@router.post("", response_model=AccountOut)
def create_account(payload: AccountIn, db: Session = Depends(get_db)):
    if db.query(models.Account).filter(models.Account.name == payload.name).first():
        raise HTTPException(400, "Account name already exists")
    acc = models.Account(**payload.model_dump())
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


@router.patch("/{acc_id}", response_model=AccountOut)
def update_account(acc_id: int, payload: AccountIn, db: Session = Depends(get_db)):
    acc = db.query(models.Account).filter(models.Account.id == acc_id).first()
    if not acc:
        raise HTTPException(404, "Account not found")
    for k, v in payload.model_dump().items():
        setattr(acc, k, v)
    db.commit()
    db.refresh(acc)
    return acc


@router.delete("/{acc_id}")
def delete_account(acc_id: int, db: Session = Depends(get_db)):
    acc = db.query(models.Account).filter(models.Account.id == acc_id).first()
    if not acc:
        raise HTTPException(404, "Account not found")
    db.query(models.Transaction).filter(models.Transaction.account_id == acc_id).update(
        {"account_id": None}
    )
    db.delete(acc)
    db.commit()
    return {"ok": True}
