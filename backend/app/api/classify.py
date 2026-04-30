import time
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
from app.deps import get_ai
from modules.classifier import classify_single, detect_duplicate, classify_batch
from utils.file_handler import truncate

router = APIRouter()


class ClassifyRequest(BaseModel):
    text: str


class DuplicateRequest(BaseModel):
    text1: str
    text2: str


class BatchRequest(BaseModel):
    reports: List[str]


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
        truncate(req.text1, 10000), truncate(req.text2, 10000), client, model
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
    result = classify_batch([truncate(r, 3000) for r in req.reports], client, model)
    try:
        from database import log_job
        log_job(module="classification", doc_type=f"batch/{len(req.reports)}",
                duration_ms=int((time.time() - t0) * 1000))
    except Exception:
        pass
    return result
