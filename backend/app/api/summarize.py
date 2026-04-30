import time
from fastapi import APIRouter
from pydantic import BaseModel
from app.deps import get_ai
from modules.summarizer import summarise_document
from utils.file_handler import truncate

router = APIRouter()


class SummarizeRequest(BaseModel):
    text: str
    document_type: str = "SUGAM Application"


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
