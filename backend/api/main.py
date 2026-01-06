"""
FastAPI backend for Alex Financial Advisor
Works both when running from repo root or from inside /backend.
No emojis (Windows cp1252 safe).
"""

from __future__ import annotations

import os
import urllib.request
import json
import sys
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from dotenv import load_dotenv

# ---------------------------
# Make imports work from both:
#   - repo root:    uvicorn backend.main:app
#   - inside backend: uvicorn main:app
# ---------------------------
THIS_FILE = Path(__file__).resolve()
REPO_ROOT = THIS_FILE.parents[1]  # .../alex_vcel
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Load env
load_dotenv(override=True)

# Logging
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
        from fastapi_clerk_auth import ClerkConfig, ClerkHTTPBearer, HTTPAuthorizationCredentials
        clerk_config = ClerkConfig(jwks_url=CLERK_JWKS_URL)
        clerk_guard = ClerkHTTPBearer(clerk_config)

        async def get_current_user_id(
            creds: "HTTPAuthorizationCredentials" = Depends(clerk_guard),
        ) -> str:
            user_id = creds.decoded.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid auth token")
            return user_id

    except Exception as e:
        # If package missing or misconfigured, still allow boot in dev
        logger.warning("Clerk auth disabled (fastapi_clerk_auth import failed): %s", e)
        CLERK_JWKS_URL = None

if not CLERK_JWKS_URL:
    DEV_USER_ID = os.getenv("DEV_USER_ID", "test_user_001")

    async def get_current_user_id() -> str:
        return DEV_USER_ID

# ---------------------------
# App
# ---------------------------
app = FastAPI(
    title="Alex Financial Advisor API",
    version="1.0.0",
)



class ResearchTriggerRequest(BaseModel):
    topic: str = "market_update"
    symbol: Optional[str] = None

class RetirementAnalyzeRequest(BaseModel):
    account_id: str
    years_until_retirement: int = 30
    target_retirement_income: float = 80000
    current_age: int = 40



def _post_json(url: str, payload: dict, timeout: int = 60) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
        try:
            parsed = json.loads(body) if body else None
        except Exception:
            parsed = body
        return {"status": resp.status, "data": parsed}


cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Better errors
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error: %s", exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# DB
db = Database()

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

@app.get("/api/user")
async def get_or_create_user(clerk_user_id: str = Depends(get_current_user_id)):
    """
    Dev mode: uses DEV_USER_ID if Clerk not configured.
    """
    user = db.users.find_by_clerk_id(clerk_user_id)
    if user:
        return {"user": user, "created": False}

    # minimal create (users PK is clerk_user_id)
    db.users.create_user(clerk_user_id=clerk_user_id, display_name=clerk_user_id)
    user = db.users.find_by_clerk_id(clerk_user_id)
    return {"user": user, "created": True}

@app.get("/api/accounts")
async def list_accounts(clerk_user_id: str = Depends(get_current_user_id)):
    return db.accounts.find_by_user(clerk_user_id)

@app.post("/api/accounts")
async def create_account(account: AccountCreate, clerk_user_id: str = Depends(get_current_user_id)):
    # ensure user exists
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


@app.delete("/api/accounts/{account_id}")
async def delete_account(account_id: str, clerk_user_id: str = Depends(get_current_user_id)):
    account = db.accounts.find_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.get("clerk_user_id") != clerk_user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    deleted = db.accounts.delete_account(clerk_user_id, account_id)
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"deleted": True, "account_id": account_id}
@app.get("/api/accounts/{account_id}/positions")
async def list_positions(account_id: str, clerk_user_id: str = Depends(get_current_user_id)):
    account = db.accounts.find_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.get("clerk_user_id") != clerk_user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    positions = db.positions.list_by_account(account_id)
    return {"positions": positions}

@app.post("/api/positions")
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

    position_id = db.positions.add_position(position.account_id, symbol, position.quantity, as_of_date=str(position.as_of_date) if getattr(position, 'as_of_date', None) else None)
    return db.positions.find_by_id(position_id)



@app.post("/api/research/trigger")
def trigger_research(req: ResearchTriggerRequest):
    """Trigger the Researcher service (no AWS Lambda)."""
    researcher_url = os.getenv("RESEARCHER_URL", "").strip()
    if not researcher_url:
        raise HTTPException(status_code=500, detail="RESEARCHER_URL is not set")

    # Accept either base URL or full endpoint
    url = researcher_url
    if not url.endswith("/research") and not url.endswith("/research/auto"):
        url = url.rstrip("/") + "/research/auto"

    payload = {"topic": req.topic}
    if req.symbol:
        payload["symbol"] = req.symbol

    try:
        return _post_json(url, payload)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to trigger researcher: {e}")


@app.post("/api/retirement/analyze")
def analyze_retirement(req: RetirementAnalyzeRequest, clerk_user_id: str = Depends(get_current_user_id)):
    """Run retirement analysis locally (no AWS Lambda)."""
    # Validate account ownership
    account = db.accounts.find_by_id(req.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.get("clerk_user_id") != clerk_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Load portfolio positions for the account
    positions = db.positions.list_by_account(req.account_id)

    # Build portfolio data expected by agent
    portfolio_data = {"account": account, "positions": positions}

    user_preferences = {
        "years_until_retirement": req.years_until_retirement,
        "target_income": req.target_retirement_income,
        "current_age": req.current_age,
    }

    # Import local retirement agent
    try:
        from backend.retirement.agent import run_retirement_analysis  # when running as a module in repo root
    except Exception:
        from backend.retirement.agent import run_retirement_analysis  # fallback if you keep it under backend/

    job_id = f"retirement_{req.account_id}"
    return run_retirement_analysis(job_id, portfolio_data, user_preferences, db=db)
