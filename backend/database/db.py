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
    """Create tables (if missing), run additive column migrations, and seed defaults.

    Called once at app startup via the lifespan context in main.py.

    No Alembic — instead we walk every mapped model and `ALTER TABLE
    ADD COLUMN` for any column missing from the live DB. This handles
    the only kind of schema change we ship today (additive), preserves
    user data, and keeps the dev loop frictionless. For renames, type
    changes, or constraint changes, the user still has to wipe the DB.
    """
    from . import models  # noqa: F401 — register models with Base before create_all

    Base.metadata.create_all(bind=engine)
    _migrate_add_columns()
    _seed_defaults()


def _migrate_add_columns():
    """For each mapped table, ALTER TABLE ADD COLUMN for any model column not present.

    SQLite's ALTER TABLE only supports adding columns (which is all we need).
    Defaults from the SQLAlchemy column definition are applied to existing
    rows where SQLite allows it.
    """
    from sqlalchemy import inspect, text
    from . import models  # noqa: F401

    insp = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            existing_cols = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing_cols:
                    continue
                # Compose: ADD COLUMN <name> <type> [NOT NULL] [DEFAULT <default>]
                col_type = col.type.compile(dialect=engine.dialect)
                default_clause = ""
                if col.default is not None and getattr(col.default, "is_scalar", False):
                    val = col.default.arg
                    if isinstance(val, str):
                        default_clause = f" DEFAULT '{val}'"
                    elif isinstance(val, bool):
                        default_clause = f" DEFAULT {1 if val else 0}"
                    else:
                        default_clause = f" DEFAULT {val}"
                null_clause = " NOT NULL" if not col.nullable else ""
                # SQLite requires a default if NOT NULL and table already has rows.
                if null_clause and not default_clause:
                    default_clause = " DEFAULT 0"
                sql = f'ALTER TABLE {table.name} ADD COLUMN {col.name} {col_type}{null_clause}{default_clause}'
                conn.execute(text(sql))


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