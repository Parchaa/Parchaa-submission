import time
from fastapi import APIRouter
from pydantic import BaseModel, field_validator
from app.deps import get_ai
from modules.summarizer import summarise_document, PROMPTS
from utils.file_handler import truncate

router = APIRouter()


class SummarizeRequest(BaseModel):
    text: str
    document_type: str = "SUGAM Application"

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("text must not be empty")
        return v

    @field_validator("document_type")
    @classmethod
    def doc_type_valid(cls, v):
        if v not in PROMPTS:
            raise ValueError(f"document_type must be one of: {', '.join(PROMPTS)}")
        return v


@router.post("/summarize")
def summarize(req: SummarizeRequest):
    t0 = time.time()
    client, model = get_ai()
    result = summarise_document(truncate(req.text), req.document_type, client, model)
    try:
        from database import log_job, save_result
        job_id = log_job(
            module="summarisation",
            doc_type=req.document_type,
            duration_ms=int((time.time() - t0) * 1000),
        )
        save_result(job_id, "summarisation", result)
    except Exception:
        pass
    return result
