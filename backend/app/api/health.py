from fastapi import APIRouter
from config import GEMINI_MODEL, DATABASE_URL, S3_BUCKET

router = APIRouter()


@router.get("/health")
def health():
    from database import is_connected, recent_jobs
    db_status = "connected" if is_connected() else ("offline" if DATABASE_URL else "not configured")
    recent = []
    try:
        recent = recent_jobs(limit=5)
    except Exception:
        pass
    return {
        "status": "ok",
        "version": "1.0.0",
        "gemini_model": GEMINI_MODEL,
        "db": db_status,
        "s3": "configured" if S3_BUCKET else "not configured",
        "recent_jobs_count": len(recent),
    }


@router.get("/jobs")
def jobs(limit: int = 50):
    """Return recent processing jobs audit log."""
    try:
        from database import recent_jobs
        return {"jobs": recent_jobs(limit=limit)}
    except Exception:
        return {"jobs": []}
