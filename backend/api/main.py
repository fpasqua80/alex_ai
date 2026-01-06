"""
FastAPI backend for Alex Financial Advisor
Works both when running from repo root or from inside /backend.
No emojis (Windows cp1252 safe).
"""

from __future__ import annotations

import os
import sys
import logging
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, Optional, List

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from dotenv import load_dotenv

# ---------------------------
# Make imports work from both:
#   - repo root:     uvicorn backend.api.main:app
#   - inside backend: uvicorn api.main:app or main:app (depending on structure)
# ---------------------------
THIS_FILE = Path(__file__).resolve()

# Try to guess repo root robustly:
REPO_ROOT_CANDIDATES = [
    THIS_FILE.parents[2] if len(THIS_FILE.parents) >= 3 else None,
    THIS_FILE.parents[1] if len(THIS_FILE.parents) >= 2 else None,
]
for cand in REPO_ROOT_CANDIDATES:
    if cand and str(cand) not in sys.path:
        sys.path.insert(0, str(cand))

load_dotenv(override=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("alex-api")

# ---------------------------
# Import DB + Schemas (robust)
# ---------------------------
try:
    # Preferred (repo root)
    from backend.database.src.models import Database
    from backend.database.src.schemas import AccountCreate, PositionCreate
except Exception:
    # Fallback (running inside /backend)
    from database.src.models import Database
    from database.src.schemas import AccountCreate, PositionCreate

# ---------------------------
# Optional Clerk auth (do not fail boot if missing)
# ---------------------------
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")

if CLERK_JWKS_URL:
    try:
        from fastapi_clerk_auth import (
            ClerkConfig,
            ClerkHTTPBearer,
            HTTPAuthorizationCredentials,
        )

        clerk_config = ClerkConfig(jwks_url=CLERK_JWKS_URL)
        clerk_guard = ClerkHTTPBearer(clerk_config)

        async def get_current_user_id(
            creds: HTTPAuthorizationCredentials = Depends(clerk_guard),
        ) -> str:
            user_id = creds.decoded.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid auth token")
            return user_id

    except Exception as e:
        logger.warning("Clerk auth disabled (fastapi_clerk_auth import failed): %s", e)
        CLERK_JWKS_URL = None

if not CLERK_JWKS_URL:
    DEV_USER_ID = os.getenv("DEV_USER_ID", "test_user_001")

    async def get_current_user_id() -> str:
        return DEV_USER_ID


# ---------------------------
# App
# ---------------------------
app = FastAPI(title="Alex Financial Advisor API", version="1.0.0")

# Tolerate /api/x vs /api/x/
app.router.redirect_slashes = True

# ---------------------------
# CORS
# ---------------------------
cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,https://spiritglacier-cwwuys.stormkit.dev",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------
# Startup: run migrations (optional)
# ---------------------------
@app.on_event("startup")
def apply_db_migrations():
    enabled = os.getenv("RUN_MIGRATIONS_ON_STARTUP", "true").lower() == "true"
    if not enabled:
        logger.info("RUN_MIGRATIONS_ON_STARTUP=false (skipping migrations)")
        return

    try:
        from backend.database.run_migrations import run_migrations  # type: ignore

        run_migrations()
        logger.info("Database migrations applied on startup")
        return
    except Exception:
        try:
            from database.run_migrations import run_migrations  # type: ignore

            run_migrations()
            logger.info("Database migrations applied on startup (fallback import)")
        except Exception:
            logger.exception("Failed to apply database migrations on startup")


# ---------------------------
# Error handler
# ---------------------------
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error: %s", exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ---------------------------
# DB
# ---------------------------
db = Database()


def _pick_account_id(account: Dict[str, Any]) -> Optional[str]:
    return account.get("id") or account.get("account_id") or account.get("uuid")


# ---------------------------
# Routes
# ---------------------------
@app.get("/")
async def root():
    return {"ok": True, "service": "alex-api"}


@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)


@app.get("/health")
async def health():
    return {"status": "healthy", "time": datetime.utcnow().isoformat()}


# ---- USER
@app.get("/api/user")
@app.get("/api/user/")
async def get_or_create_user(clerk_user_id: str = Depends(get_current_user_id)):
    user = db.users.find_by_clerk_id(clerk_user_id)
    if user:
        return {"user": user, "created": False}

    db.users.create_user(clerk_user_id=clerk_user_id, display_name=clerk_user_id)
    user = db.users.find_by_clerk_id(clerk_user_id)
    return {"user": user, "created": True}


# ---- ACCOUNTS
@app.get("/api/accounts")
@app.get("/api/accounts/")
async def list_accounts(clerk_user_id: str = Depends(get_current_user_id)):
    return db.accounts.find_by_user(clerk_user_id)


@app.post("/api/accounts")
@app.post("/api/accounts/")
async def create_account(account: AccountCreate, clerk_user_id: str = Depends(get_current_user_id)):
    user = db.users.find_by_clerk_id(clerk_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    account_id = db.accounts.create_account(
        clerk_user_id=clerk_user_id,
        account_name=account.account_name,
        account_purpose=account.account_purpose,
        cash_balance=account.cash_balance,
        cash_interest=account.cash_interest,
    )
    return db.accounts.find_by_id(account_id)


# ---- INSTRUMENTS (needed by frontend dropdowns / validation)
@app.get("/api/instruments")
@app.get("/api/instruments/")
async def list_instruments(clerk_user_id: str = Depends(get_current_user_id)):
    """
    Returns the instrument universe for autocomplete.
    This endpoint is intentionally public for the authenticated user,
    but it does not filter by user since instruments are global.
    """
    inst = getattr(db, "instruments", None)
    if not inst:
        return {"instruments": []}

    # Try common method names safely
    for method_name in ("list_all", "all", "find_all", "get_all"):
        fn = getattr(inst, method_name, None)
        if callable(fn):
            items = fn()
            return {"instruments": items}

    # Last resort: if the instruments model exposes a db/query helper
    # we avoid raw SQL guessing here to prevent breaking deployments.
    raise HTTPException(status_code=501, detail="Instrument listing not implemented in instruments model")


# ---- POSITIONS by ACCOUNT
@app.get("/api/accounts/{account_id}/positions")
@app.get("/api/accounts/{account_id}/positions/")
async def list_positions(account_id: str, clerk_user_id: str = Depends(get_current_user_id)):
    account = db.accounts.find_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.get("clerk_user_id") != clerk_user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    positions = db.positions.find_by_account(account_id)
    return {"positions": positions}


# ---- ADD POSITION
@app.post("/api/positions")
@app.post("/api/positions/")
async def add_position(position: PositionCreate, clerk_user_id: str = Depends(get_current_user_id)):
    account = db.accounts.find_by_id(position.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.get("clerk_user_id") != clerk_user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    symbol = position.symbol.upper()

    inst = db.instruments.find_by_symbol(symbol)
    if not inst:
        raise HTTPException(status_code=404, detail=f"Instrument {symbol} not found")

    position_id = db.positions.add_position(position.account_id, symbol, position.quantity)
    return db.positions.find_by_id(position_id)
