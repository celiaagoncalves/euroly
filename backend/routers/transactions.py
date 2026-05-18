"""/api/transactions — CRUD, validation queue and bank-file import.

GET    /api/transactions         filterable list (account, category, credit, month, year, type, validated, search)
GET    /api/transactions/pending unvalidated rows for the Validação page
PATCH  /api/transactions/{id}    partial update (category, credit, account, validated, transfer flag, description)
DELETE /api/transactions/{id}
POST   /api/transactions/import  multipart upload (file + account_id) -> parses, dedupes, runs rules
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import extract
from sqlalchemy.orm import Session

from database.db import get_db
from database import models

router = APIRouter()


class TransactionOut(BaseModel):
    id: int
    date: date
    value_date: Optional[date]
    description: str
    amount: float
    type: str
    balance_after: Optional[float]
    account_id: Optional[int]
    account_name: Optional[str]
    category_id: Optional[int]
    category_name: Optional[str]
    credit_id: Optional[int]
    credit_name: Optional[str]
    is_validated: bool
    is_transfer: bool
    source_file: Optional[str]


class TransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    credit_id: Optional[int] = None
    account_id: Optional[int] = None
    is_validated: Optional[bool] = None
    is_transfer: Optional[bool] = None
    description: Optional[str] = None


def _serialize(t: models.Transaction) -> TransactionOut:
    """Flatten a Transaction + its relationships into the API DTO.

    We hand-roll this instead of `from_attributes=True` because we want
    the `*_name` fields denormalized into the response so the frontend
    doesn't have to do its own joins.
    """
    return TransactionOut(
        id=t.id,
        date=t.date,
        value_date=t.value_date,
        description=t.description,
        amount=t.amount,
        type=t.type,
        balance_after=t.balance_after,
        account_id=t.account_id,
        account_name=t.account.name if t.account else None,
        category_id=t.category_id,
        category_name=t.category.name if t.category else None,
        credit_id=t.credit_id,
        credit_name=t.credit.name if t.credit else None,
        is_validated=t.is_validated,
        is_transfer=t.is_transfer,
        source_file=t.source_file,
    )


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    credit_id: Optional[int] = None,
    type: Optional[str] = Query(None, pattern="^(income|expense)$"),
    validated: Optional[bool] = None,
    is_transfer: Optional[bool] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Transaction)
    if month:
        q = q.filter(extract("month", models.Transaction.date) == month)
    if year:
        q = q.filter(extract("year", models.Transaction.date) == year)
    if account_id is not None:
        q = q.filter(models.Transaction.account_id == account_id)
    if category_id is not None:
        q = q.filter(models.Transaction.category_id == category_id)
    if credit_id is not None:
        q = q.filter(models.Transaction.credit_id == credit_id)
    if type:
        q = q.filter(models.Transaction.type == type)
    if validated is not None:
        q = q.filter(models.Transaction.is_validated == validated)
    if is_transfer is not None:
        q = q.filter(models.Transaction.is_transfer == is_transfer)
    if search:
        q = q.filter(models.Transaction.description.ilike(f"%{search}%"))

    rows = q.order_by(models.Transaction.date.desc(), models.Transaction.id.desc()).all()
    return [_serialize(t) for t in rows]


@router.get("/pending", response_model=list[TransactionOut])
def list_pending(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Transaction)
        .filter(models.Transaction.is_validated.is_(False))
        .order_by(models.Transaction.date.desc())
        .all()
    )
    return [_serialize(t) for t in rows]


@router.patch("/{tx_id}", response_model=TransactionOut)
def update_transaction(tx_id: int, payload: TransactionUpdate, db: Session = Depends(get_db)):
    tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Transaction not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(tx, k, v)
    db.commit()
    db.refresh(tx)
    return _serialize(tx)


@router.delete("/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Transaction not found")
    db.delete(tx)
    db.commit()
    return {"ok": True}


@router.post("/import")
async def import_file(
    file: UploadFile = File(...),
    account_id: int = Form(...),
    db: Session = Depends(get_db),
):
    """Upload a bank export and bind it to an account.

    Two phases: (1) `import_bank_file` parses the file and inserts new
    Transaction rows tagged with `account_id`; (2) `apply_rules` runs
    auto-categorization across anything still without a category.
    Returns the count of new vs skipped (duplicate) rows.
    """
    # Lazy imports keep startup fast — pandas/openpyxl are heavy.
    from services.importer import import_bank_file
    from services.categorizer import apply_rules

    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        raise HTTPException(400, "Account not found — create it first in Backoffice")

    summary = import_bank_file(db, file, account_id=account_id)
    apply_rules(db)
    return summary
