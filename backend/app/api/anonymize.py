from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from app.deps import get_ai
from modules.anonymizer import run_anonymisation
from utils.file_handler import truncate

router = APIRouter()


class AnonymizeRequest(BaseModel):
    text: str
    mode: str = "pseudonymise"

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("text must not be empty")
        return v

    @field_validator("mode")
    @classmethod
    def mode_valid(cls, v):
        if v not in ("pseudonymise", "full"):
            raise ValueError("mode must be 'pseudonymise' or 'full'")
        return v


@router.post("/anonymize")
def anonymize(req: AnonymizeRequest):
    client, model = get_ai()
    result = run_anonymisation(truncate(req.text), client, model, req.mode)
    return {
        "anonymized_text": result["final_text"],
        "all_entities":    result["all_entities"],
        "rule_matches":    result["rule_matches"],
        "ai_matches":      result.get("layer3_matches", []),
        "total_entities":  result["total_entities"],
        "job_id":          result.get("job_id", ""),
    }


@router.get("/anonymize/reverse/{token}")
def reverse_token(token: str):
    """
    Authorised reversal: given a pseudonymisation token like [PERSON_001],
    returns the original PII value from the encrypted token registry.
    In production this endpoint must be protected by role-based auth (RBAC).
    """
    try:
        from database import decrypt_token
        original = decrypt_token(token)
    except Exception as e:
        raise HTTPException(503, f"Database unavailable: {e}")

    if original is None:
        raise HTTPException(404, f"Token '{token}' not found in registry")

    return {
        "token":    token,
        "original": original,
        "warning":  "This endpoint exposes PII. Every access must be logged and audited.",
    }


@router.get("/anonymize/audit")
def audit_tokens(limit: int = 50):
    """Return recent token registry entries for audit (no plaintext, tokens only)."""
    try:
        from database import token_jobs
        return {"tokens": token_jobs(limit=limit)}
    except Exception:
        return {"tokens": []}
