"""SQLAlchemy engine + session factory + DB bootstrap.

The database lives in backend/euroly.db (gitignored). The path is computed
from this file's location so the app works regardless of the current
working directory at launch time.

`check_same_thread=False` is required for SQLite because FastAPI may serve
requests on different threads from the one that created the connection;
SQLAlchemy's session pool handles isolation on top of that.
"""
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Resolve to <repo>/backend/euroly.db regardless of cwd.
DB_PATH = Path(__file__).resolve().parent.parent / "euroly.db"
SQLITE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLITE_URL,
    connect_args={"check_same_thread": False},
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a request-scoped Session and ensures it's closed.

    Use as `db: Session = Depends(get_db)` in route signatures.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create tables (if missing) and seed default categories on a fresh DB.

    Called once at app startup via the lifespan context in main.py.
    NOTE: there is no migration tool — if the schema changes, delete
    backend/euroly.db and let it be recreated.
    """
    from . import models  # noqa: F401 — register models with Base before create_all

    Base.metadata.create_all(bind=engine)
    _seed_defaults()


def _seed_defaults():
    """Insert generic PT categories on first run. Idempotent.

    Privacy note: we deliberately do NOT seed Accounts or Credits — those
    contain personal info (bank names, creditors) and must be added by the
    user via the Backoffice UI so they never end up in version control.
    """
    from . import models

    with SessionLocal() as db:
        # Idempotent: skip if any category already exists.
        if db.query(models.Category).count() > 0:
            return

        defaults = [
            ("Salário", "income", "#22c55e", "wallet"),
            ("Freelance", "income", "#16a34a", "briefcase"),
            ("Outros Rendimentos", "income", "#15803d", "plus"),
            ("Habitação", "expense", "#ef4444", "home"),
            ("Energia", "expense", "#f97316", "zap"),
            ("Água", "expense", "#3b82f6", "droplet"),
            ("Internet", "expense", "#6366f1", "wifi"),
            ("Supermercado", "expense", "#eab308", "shopping-cart"),
            ("Transportes", "expense", "#06b6d4", "car"),
            ("Restauração", "expense", "#ec4899", "utensils"),
            ("Saúde", "expense", "#14b8a6", "heart"),
            ("Lazer", "expense", "#a855f7", "smile"),
            ("Outros", "expense", "#64748b", "more-horizontal"),
        ]
        for name, type_, color, icon in defaults:
            db.add(models.Category(name=name, type=type_, color=color, icon=icon))
        db.commit()