import time
from fastapi import APIRouter
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from app.deps import get_ai
from modules.inspection_report import generate_inspection_report, format_report_as_text
from utils.file_handler import truncate

router = APIRouter()


class ReportRequest(BaseModel):
    text: str
    report_type: str = "GMP Inspection"


@router.post("/report")
def report(req: ReportRequest):
    t0 = time.time()
    client, model = get_ai()
    result = generate_inspection_report(truncate(req.text), req.report_type, client, model)
    try:
        from database import log_job, save_result
        job_id = log_job(module="inspection_report", doc_type=req.report_type,
                         duration_ms=int((time.time() - t0) * 1000))
        save_result(job_id, "inspection_report", {
            k: v for k, v in result.items() if k != "findings"
        })
    except Exception:
        pass
    return result


@router.post("/report/text", response_class=PlainTextResponse)
def report_text(req: ReportRequest):
    client, model = get_ai()
    result = generate_inspection_report(truncate(req.text), req.report_type, client, model)
    return format_report_as_text(result)
