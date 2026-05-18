"""/api/categories — CRUD over budget buckets.

Deleting a category does not cascade-delete its transactions: instead it
nulls their `category_id` and flips `is_validated` back to False so they
reappear in the validation queue for re-categorization.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.db import get_db
from database import models

router = APIRouter()


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: str = Field(pattern="^(income|expense)$")
    color: str = "#64748b"
    icon: str = "circle"


class CategoryOut(CategoryIn):
    id: int

    class Config:
        from_attributes = True


@router.get("", response_model=list[CategoryOut])
def list_categories(type: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Category)
    if type:
        q = q.filter(models.Category.type == type)
    return q.order_by(models.Category.type, models.Category.name).all()


@router.post("", response_model=CategoryOut)
def create_category(payload: CategoryIn, db: Session = Depends(get_db)):
    if db.query(models.Category).filter(models.Category.name == payload.name).first():
        raise HTTPException(400, "Category name already exists")
    cat = models.Category(**payload.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.patch("/{cat_id}", response_model=CategoryOut)
def update_category(cat_id: int, payload: CategoryIn, db: Session = Depends(get_db)):
    cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    for k, v in payload.model_dump().items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db)):
    cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    db.query(models.Transaction).filter(models.Transaction.category_id == cat_id).update(
        {"category_id": None, "is_validated": False}
    )
    db.delete(cat)
    db.commit()
    return {"ok": True}
