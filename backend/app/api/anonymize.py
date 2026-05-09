from fastapi import APIRouter, HTTPException, UploadFile, File, Response
from pydantic import BaseModel, field_validator
from app.deps import get_ai
from modules.anonymizer import run_anonymisation
from utils.file_handler import truncate, extract_text_from_file
from utils.presidio_engine import redact_pdf_inplace
import io
import re

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


@router.post("/anonymize/pdf")
async def anonymize_pdf(file: UploadFile = File(...), mode: str = "pseudonymise"):
    """
    Direct PDF-to-PDF redaction. Extracts text for analysis, 
    then applies redaction boxes with tokens back onto the original layout.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files supported for direct redaction")
    
    content = await file.read()
    
    # Wrap bytes for extraction utility
    class MockFile:
        def __init__(self, b, name):
            self.b = b
            self.name = name
        def read(self): return self.b
        def seek(self, _): pass

    text = extract_text_from_file(MockFile(content, file.filename))
    if not text:
        raise HTTPException(400, "Could not extract text from PDF for analysis")

    client, model = get_ai()
    result = run_anonymisation(truncate(text), client, model, mode)
    
    # Build {original_text: token} mapping for PDF redaction.
    # In full mode, strip token numbers ([PERSON_001] → [PERSON]) to match
    # the de-numbered final_text output. Layer 3 natural-language replacements
    # are also included so e.g. "GMCH-2019-7721" → "[an administrative reference]".
    mapping = {}
    for e in result["all_entities"]:
        val = e.get("value", "")
        tok = e.get("token", "")
        if not val or not tok:
            continue
        if mode == "full":
            tok = re.sub(r'(_\d{3})(\])$', r'\2', tok)
        mapping[val] = tok
            
    redacted_content = redact_pdf_inplace(content, mapping)
    
    return Response(
        content=redacted_content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=redacted_{file.filename}"}
    )


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
