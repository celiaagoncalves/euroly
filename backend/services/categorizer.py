"""Auto-categorization engine.

Runs after every import to apply user-defined Rules to uncategorized
transactions. Touches only rows with `category_id IS NULL`, so manual
assignments and existing categorizations are never overwritten — the
user remains the source of truth.
"""
import re
from sqlalchemy.orm import Session

from database import models


def apply_rules(db: Session) -> int:
    """Apply rules in priority order to every uncategorized transaction.

    For each pending transaction we walk the rules list and stop at the
    first match (lowest priority number wins). If the matching rule also
    has a `credit_id`, the transaction is linked to that credit too —
    this is how a repeating bank line for a loan payment automatically
    attaches to the right loan in the Créditos page.

    Returns the count of transactions that received a category.
    """
    rules = (
        db.query(models.Rule)
        .order_by(models.Rule.priority.asc(), models.Rule.id.asc())
        .all()
    )
    if not rules:
        return 0

    txs = (
        db.query(models.Transaction)
        .filter(models.Transaction.category_id.is_(None))
        .all()
    )

    matched = 0
    for tx in txs:
        for rule in rules:
            if _matches(tx.description, rule.keyword, rule.match_type):
                tx.category_id = rule.category_id
                if rule.credit_id is not None:
                    tx.credit_id = rule.credit_id
                # Rule match means the user has expressed trust in this
                # pattern, so we also mark the transaction as validated.
                # The Validação page is for things rules DIDN'T match.
                tx.is_validated = True
                matched += 1
                break

    db.commit()
    return matched


def _matches(description: str, keyword: str, match_type: str) -> bool:
    """Case-insensitive description matcher. Mirrors `_matches_rule` in
    routers/rules.py so the preview endpoint and the import-time
    categorizer use identical semantics.
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
