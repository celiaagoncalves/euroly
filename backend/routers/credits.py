"""/api/credits — CRUD over loans/credit lines plus payment-progress views.

Progress is derived from transactions linked via `credit_id`:
    amount_paid       = SUM(transaction.amount WHERE credit_id = X)
    installments_paid = round(amount_paid / monthly_payment)

We don't model an installment schedule explicitly — the assumption is
fixed-amount monthly payments, which matches typical PT consumer credit
(Cofidis, Cetelem, BNP, etc.). If a payment is missed or partial, the
computed count may be off by one; the user can correct via the notes
field if needed.
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


class CreditIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    creditor: str = Field(min_length=1, max_length=80)
    total_amount: float = Field(gt=0)
    monthly_payment: float = Field(gt=0)
    total_installments: int = Field(gt=0)
    interest_rate: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool = True
    color: str = "#a855f7"
    notes: Optional[str] = None


class CreditOut(CreditIn):
    id: int

    class Config:
        from_attributes = True


class CreditProgress(CreditOut):
    amount_paid: float
    amount_remaining: float
    installments_paid: int
    installments_remaining: int
    progress_pct: float
    last_payment_date: Optional[date]


def _progress(db: Session, credit: models.Credit) -> dict:
    """Compute payment progress for a single credit.

    All fields are derived — none are persisted on Credit itself, which
    means they always reflect the current state of linked transactions.
    """
    amount_paid = (
        db.query(func.coalesce(func.sum(models.Transaction.amount), 0.0))
        .filter(models.Transaction.credit_id == credit.id)
        .scalar()
        or 0.0
    )
    last = (
        db.query(func.max(models.Transaction.date))
        .filter(models.Transaction.credit_id == credit.id)
        .scalar()
    )
    installments_paid = (
        int(round(amount_paid / credit.monthly_payment))
        if credit.monthly_payment > 0
        else 0
    )
    installments_paid = min(installments_paid, credit.total_installments)
    return {
        "amount_paid": round(amount_paid, 2),
        "amount_remaining": round(max(credit.total_amount - amount_paid, 0.0), 2),
        "installments_paid": installments_paid,
        "installments_remaining": max(credit.total_installments - installments_paid, 0),
        "progress_pct": round(
            min((amount_paid / credit.total_amount * 100) if credit.total_amount > 0 else 0.0, 100.0),
            2,
        ),
        "last_payment_date": last,
    }


@router.get("", response_model=list[CreditProgress])
def list_credits(active_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(models.Credit)
    if active_only:
        q = q.filter(models.Credit.is_active.is_(True))
    rows = q.order_by(models.Credit.is_active.desc(), models.Credit.name).all()
    out = []
    for c in rows:
        data = CreditOut.model_validate(c).model_dump()
        out.append(CreditProgress(**data, **_progress(db, c)))
    return out


@router.get("/{credit_id}", response_model=CreditProgress)
def get_credit(credit_id: int, db: Session = Depends(get_db)):
    c = db.query(models.Credit).filter(models.Credit.id == credit_id).first()
    if not c:
        raise HTTPException(404, "Credit not found")
    data = CreditOut.model_validate(c).model_dump()
    return CreditProgress(**data, **_progress(db, c))


@router.get("/{credit_id}/transactions")
def credit_transactions(credit_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(models.Transaction)
        .filter(models.Transaction.credit_id == credit_id)
        .order_by(models.Transaction.date.desc())
        .all()
    )
    return [
        {
            "id": t.id,
            "date": t.date.isoformat(),
            "description": t.description,
            "amount": t.amount,
            "account_id": t.account_id,
            "account_name": t.account.name if t.account else None,
        }
        for t in rows
    ]


@router.post("", response_model=CreditOut)
def create_credit(payload: CreditIn, db: Session = Depends(get_db)):
    c = models.Credit(**payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.patch("/{credit_id}", response_model=CreditOut)
def update_credit(credit_id: int, payload: CreditIn, db: Session = Depends(get_db)):
    c = db.query(models.Credit).filter(models.Credit.id == credit_id).first()
    if not c:
        raise HTTPException(404, "Credit not found")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{credit_id}")
def delete_credit(credit_id: int, db: Session = Depends(get_db)):
    c = db.query(models.Credit).filter(models.Credit.id == credit_id).first()
    if not c:
        raise HTTPException(404, "Credit not found")
    db.query(models.Transaction).filter(models.Transaction.credit_id == credit_id).update(
        {"credit_id": None}
    )
    db.delete(c)
    db.commit()
    return {"ok": True}
