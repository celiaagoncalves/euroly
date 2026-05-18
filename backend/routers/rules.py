"""/api/rules — CRUD + live preview + JSON import/export of categorization rules.

A rule says "when a transaction description matches <keyword> using
<match_type>, assign it to <category_id> (and optionally <credit_id>)".
Lower `priority` runs first; the first match wins.

The `/preview` endpoints let the UI show how many existing transactions
a rule would match before committing to it. The JSON export/import is
intended for sharing rule sets between machines or backing them up —
note that exported rules reference categories by NAME (not id) so they
can be re-imported into a fresh DB.
"""
import json
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.db import get_db
from database import models

router = APIRouter()

# Authoritative set used by the ad-hoc preview endpoint, which doesn't go
# through the Pydantic validator on RuleIn.
MATCH_TYPES = {"contains", "exact", "startswith", "regex"}


class RuleIn(BaseModel):
    keyword: str = Field(min_length=1, max_length=200)
    match_type: str = Field(default="contains", pattern="^(contains|exact|startswith|regex)$")
    category_id: int
    credit_id: Optional[int] = None
    priority: int = 100


class RuleOut(RuleIn):
    id: int
    category_name: Optional[str] = None
    credit_name: Optional[str] = None

    class Config:
        from_attributes = True


def _serialize(rule: models.Rule) -> RuleOut:
    return RuleOut(
        id=rule.id,
        keyword=rule.keyword,
        match_type=rule.match_type,
        category_id=rule.category_id,
        credit_id=rule.credit_id,
        priority=rule.priority,
        category_name=rule.category.name if rule.category else None,
        credit_name=rule.credit.name if rule.credit else None,
    )


@router.get("", response_model=list[RuleOut])
def list_rules(db: Session = Depends(get_db)):
    rows = db.query(models.Rule).order_by(models.Rule.priority.asc(), models.Rule.id.asc()).all()
    return [_serialize(r) for r in rows]


@router.post("", response_model=RuleOut)
def create_rule(payload: RuleIn, db: Session = Depends(get_db)):
    if not db.query(models.Category).filter(models.Category.id == payload.category_id).first():
        raise HTTPException(400, "Category does not exist")
    if payload.credit_id is not None:
        if not db.query(models.Credit).filter(models.Credit.id == payload.credit_id).first():
            raise HTTPException(400, "Credit does not exist")
    rule = models.Rule(**payload.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _serialize(rule)


@router.patch("/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: int, payload: RuleIn, db: Session = Depends(get_db)):
    rule = db.query(models.Rule).filter(models.Rule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    for k, v in payload.model_dump().items():
        setattr(rule, k, v)
    db.commit()
    db.refresh(rule)
    return _serialize(rule)


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(models.Rule).filter(models.Rule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return {"ok": True}


@router.get("/{rule_id}/preview")
def preview_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(models.Rule).filter(models.Rule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    return _matches(db, rule.keyword, rule.match_type)


class PreviewRequest(BaseModel):
    keyword: str
    match_type: str = "contains"


@router.post("/preview")
def preview_rule_adhoc(payload: PreviewRequest, db: Session = Depends(get_db)):
    if payload.match_type not in MATCH_TYPES:
        raise HTTPException(400, "Invalid match_type")
    return _matches(db, payload.keyword, payload.match_type)


def _matches(db: Session, keyword: str, match_type: str):
    rows = db.query(models.Transaction).all()
    matches = []
    for t in rows:
        if _matches_rule(t.description, keyword, match_type):
            matches.append(
                {
                    "id": t.id,
                    "date": t.date.isoformat(),
                    "description": t.description,
                    "amount": t.amount,
                }
            )
    return {"count": len(matches), "transactions": matches[:50]}


def _matches_rule(description: str, keyword: str, match_type: str) -> bool:
    """Pure matching function — duplicated in services/categorizer for the
    apply-rules path. Kept here so the preview endpoint stays self-contained.

    Matching is case-insensitive across all four modes. Regex compilation
    errors fall through to a False rather than raising — invalid patterns
    just match nothing.
    """
    desc = description.lower()
    kw = keyword.lower()
    if match_type == "contains":
        return kw in desc
    if match_type == "exact":
        return desc.strip() == kw.strip()
    if match_type == "startswith":
        return desc.startswith(kw)
    if match_type == "regex":
        try:
            return re.search(keyword, description, flags=re.IGNORECASE) is not None
        except re.error:
            return False
    return False


@router.get("/export")
def export_rules(db: Session = Depends(get_db)):
    rules = db.query(models.Rule).order_by(models.Rule.priority).all()
    return {
        "rules": [
            {
                "keyword": r.keyword,
                "match_type": r.match_type,
                "priority": r.priority,
                "category_name": r.category.name if r.category else None,
            }
            for r in rules
        ]
    }


@router.post("/import")
async def import_rules(file: UploadFile = File(...), db: Session = Depends(get_db)):
    raw = await file.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")

    items = data.get("rules") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise HTTPException(400, "Expected a list of rules")

    created = 0
    for item in items:
        cat_name = item.get("category_name")
        cat = db.query(models.Category).filter(models.Category.name == cat_name).first()
        if not cat:
            continue
        rule = models.Rule(
            keyword=item["keyword"],
            match_type=item.get("match_type", "contains"),
            category_id=cat.id,
            priority=item.get("priority", 100),
        )
        db.add(rule)
        created += 1
    db.commit()
    return {"created": created}
