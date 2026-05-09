import time
from fastapi import APIRouter
from pydantic import BaseModel, field_validator
from app.deps import get_ai
from modules.completeness import assess_completeness, compare_documents, text_diff
from utils.file_handler import truncate

router = APIRouter()


class CompareRequest(BaseModel):
    document1: str
    document2: str

    @field_validator("document1", "document2")
    @classmethod
    def docs_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("document fields must not be empty")
        return v


class CompletenessRequest(BaseModel):
    text: str
    checklist_type: str = "Clinical Trial Application"
    filename: str = ""

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("text must not be empty")
        return v


@router.post("/compare")
def compare(req: CompareRequest):
    t0 = time.time()
    client, model = get_ai()
    result = compare_documents(truncate(req.document1), truncate(req.document2), client, model)
    diff_lines = text_diff(req.document1[:5000], req.document2[:5000])
    result["diff_lines"] = diff_lines[:100]
    try:
        from database import log_job, save_result
        job_id = log_job(module="comparison", doc_type="document_compare",
                         duration_ms=int((time.time() - t0) * 1000))
        save_result(job_id, "comparison", {k: v for k, v in result.items() if k != "diff_lines"})
    except Exception:
        pass
    return result


@router.post("/completeness")
def completeness(req: CompletenessRequest):
    t0 = time.time()
    client, model = get_ai()
    result = assess_completeness(truncate(req.text), req.checklist_type, client, model)
    try:
        from database import log_job, save_result
        job_id = log_job(module="completeness", doc_type=req.checklist_type,
                         filename=req.filename,
                         duration_ms=int((time.time() - t0) * 1000))
        save_result(job_id, "completeness", result)
    except Exception:
        pass
    return result
