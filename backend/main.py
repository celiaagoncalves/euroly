"""FastAPI entry point.

Wires up the application: creates the FastAPI instance, runs DB
initialization on startup (via the lifespan context manager), configures
CORS for the Vite dev server, and mounts every router under /api/...

The Vite frontend proxies /api -> http://localhost:8000 (see
frontend/vite.config.js), so the browser never talks to port 8000
directly — CORS allowances here are only relevant for direct dev tooling.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.db import init_db
from routers import accounts, categories, credits, dashboard, rules, transactions


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once at startup: creates tables if missing and seeds default
    # categories on a fresh DB. Never seeds Accounts or Credits (those
    # contain user PII and must be created by the user via Backoffice).
    init_db()
    yield


app = FastAPI(title="Euroly API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(credits.router, prefix="/api/credits", tags=["credits"])
app.include_router(rules.router, prefix="/api/rules", tags=["rules"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])