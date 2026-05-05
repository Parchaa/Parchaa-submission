import time
from fastapi import APIRouter
from pydantic import BaseModel, field_validator
from typing import List
from app.deps import get_ai
from modules.classifier import classify_single, detect_duplicate, classify_batch
from utils.file_handler import truncate

router = APIRouter()


class ClassifyRequest(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("text must not be empty")
        return v


class DuplicateRequest(BaseModel):
    text1: str
    text2: str

    @field_validator("text1", "text2")
    @classmethod
    def texts_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("text fields must not be empty")
        return v


class BatchRequest(BaseModel):
    reports: List[str]

    @field_validator("reports")
    @classmethod
    def reports_valid(cls, v):
        filtered = [r for r in (v or []) if r and r.strip()]
        if len(filtered) < 2:
            raise ValueError("at least 2 non-empty reports are required for batch classification")
        return filtered


@router.post("/classify")
def classify(req: ClassifyRequest):
    t0 = time.time()
    client, model = get_ai()
    result = classify_single(truncate(req.text), client, model)
    try:
        from database import log_job, save_result
        job_id = log_job(module="classification", doc_type="single",
                         duration_ms=int((time.time() - t0) * 1000))
        save_result(job_id, "classification", result)
    except Exception:
        pass
    return result


@router.post("/duplicate")
def duplicate(req: DuplicateRequest):
    t0 = time.time()
    client, model = get_ai()
    result = detect_duplicate(
        truncate(req.text1, 50000), truncate(req.text2, 50000), client, model
    )
    try:
        from database import log_job
        log_job(module="classification", doc_type="duplicate",
                duration_ms=int((time.time() - t0) * 1000))
    except Exception:
        pass
    return result


@router.post("/classify/batch")
def batch(req: BatchRequest):
    t0 = time.time()
    client, model = get_ai()
    result = classify_batch([truncate(r, 15000) for r in req.reports], client, model)
    try:
        from database import log_job
        log_job(module="classification", doc_type=f"batch/{len(req.reports)}",
                duration_ms=int((time.time() - t0) * 1000))
    except Exception:
        pass
    return result
