"""/api/dashboard — aggregated views for charts and KPIs.

All endpoints accept an optional `account_id` filter — without it they
aggregate across every account, giving the "vista geral" of total
finances. With it, they show that single account.

`is_transfer=True` transactions are excluded from every aggregation here.
Otherwise a €500 transfer from Account A to Account B would inflate
income by €500 AND expense by €500, distorting savings rate and the
expense breakdown.
"""
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from database.db import get_db
from database import models

router = APIRouter()


def _base_query(db: Session, *, exclude_transfers: bool = True):
    """Starting point for dashboard queries — applies the transfer filter."""
    q = db.query(models.Transaction)
    if exclude_transfers:
        q = q.filter(models.Transaction.is_transfer.is_(False))
    return q


@router.get("/summary")
def monthly_summary(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    account_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = _base_query(db)
    if month:
        q = q.filter(extract("month", models.Transaction.date) == month)
    if year:
        q = q.filter(extract("year", models.Transaction.date) == year)
    if account_id is not None:
        q = q.filter(models.Transaction.account_id == account_id)

    total_income = (
        q.filter(models.Transaction.type == "income")
        .with_entities(func.coalesce(func.sum(models.Transaction.amount), 0.0))
        .scalar()
        or 0.0
    )
    total_expenses = (
        q.filter(models.Transaction.type == "expense")
        .with_entities(func.coalesce(func.sum(models.Transaction.amount), 0.0))
        .scalar()
        or 0.0
    )
    savings = total_income - total_expenses
    savings_rate = (savings / total_income * 100) if total_income > 0 else 0.0

    return {
        "month": month,
        "year": year,
        "account_id": account_id,
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "savings": round(savings, 2),
        "savings_rate": round(savings_rate, 2),
    }


@router.get("/by-month")
def by_month(
    year: Optional[int] = None,
    account_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = _base_query(db).with_entities(
        extract("year", models.Transaction.date).label("y"),
        extract("month", models.Transaction.date).label("m"),
        models.Transaction.type,
        func.sum(models.Transaction.amount),
    ).group_by("y", "m", models.Transaction.type)

    if year:
        q = q.filter(extract("year", models.Transaction.date) == year)
    if account_id is not None:
        q = q.filter(models.Transaction.account_id == account_id)

    buckets: dict[str, dict] = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for y, m, t, total in q.all():
        key = f"{int(y):04d}-{int(m):02d}"
        buckets[key][t] = float(total or 0)

    return [
        {
            "period": k,
            "income": round(v["income"], 2),
            "expense": round(v["expense"], 2),
            "savings": round(v["income"] - v["expense"], 2),
        }
        for k, v in sorted(buckets.items())
    ]


@router.get("/by-category")
def by_category(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    account_id: Optional[int] = None,
    type: str = Query("expense", pattern="^(income|expense)$"),
    db: Session = Depends(get_db),
):
    q = (
        db.query(
            models.Category.id,
            models.Category.name,
            models.Category.color,
            func.coalesce(func.sum(models.Transaction.amount), 0.0).label("total"),
        )
        .join(models.Transaction, models.Transaction.category_id == models.Category.id)
        .filter(
            models.Transaction.type == type,
            models.Transaction.is_transfer.is_(False),
        )
        .group_by(models.Category.id)
    )
    if month:
        q = q.filter(extract("month", models.Transaction.date) == month)
    if year:
        q = q.filter(extract("year", models.Transaction.date) == year)
    if account_id is not None:
        q = q.filter(models.Transaction.account_id == account_id)

    return [
        {
            "category_id": cid,
            "name": name,
            "color": color,
            "total": round(float(total or 0), 2),
        }
        for cid, name, color, total in q.order_by(func.sum(models.Transaction.amount).desc()).all()
    ]


@router.get("/savings-evolution")
def savings_evolution(account_id: Optional[int] = None, db: Session = Depends(get_db)):
    rows = by_month(year=None, account_id=account_id, db=db)
    running = 0.0
    out = []
    for r in rows:
        running += r["savings"]
        out.append({"period": r["period"], "cumulative_savings": round(running, 2), "savings": r["savings"]})
    return out
