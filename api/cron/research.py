from fastapi import APIRouter

router = APIRouter()


@router.post("/api/cron/research")
def run_research():
    return {"status": "cron executed"}
