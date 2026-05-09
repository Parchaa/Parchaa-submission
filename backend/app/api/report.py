import time
from fastapi import APIRouter, Response
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, field_validator
from app.deps import get_ai
from modules.inspection_report import generate_inspection_report, format_report_as_text, format_report_as_xlsx
from utils.file_handler import truncate

router = APIRouter()


_VALID_REPORT_TYPES = frozenset([
    "GMP Inspection", "GCP Inspection", "GDP Inspection",
    "Pharmacovigilance Audit", "Clinical Trial Site Audit",
])


class ReportRequest(BaseModel):
    text: str
    report_type: str = "GMP Inspection"
    filename: str = ""

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("text must not be empty")
        return v

    @field_validator("report_type")
    @classmethod
    def report_type_valid(cls, v):
        if v not in _VALID_REPORT_TYPES:
            raise ValueError(f"report_type must be one of: {', '.join(sorted(_VALID_REPORT_TYPES))}")
        return v


@router.post("/report")
def report(req: ReportRequest):
    t0 = time.time()
    client, model = get_ai()
    result = generate_inspection_report(truncate(req.text), req.report_type, client, model)
    try:
        from database import log_job, save_result
        job_id = log_job(module="inspection_report", doc_type=req.report_type,
                         filename=req.filename,
                         duration_ms=int((time.time() - t0) * 1000))
        save_result(job_id, "inspection_report", result)
    except Exception:
        pass
    return result


@router.post("/report/text", response_class=PlainTextResponse)
def report_text(req: ReportRequest):
    client, model = get_ai()
    result = generate_inspection_report(truncate(req.text), req.report_type, client, model)
    return format_report_as_text(result)


@router.post("/report/xlsx")
def report_xlsx(req: ReportRequest):
    client, model = get_ai()
    result = generate_inspection_report(truncate(req.text), req.report_type, client, model)
    xlsx_bytes = format_report_as_xlsx(result)
    
    filename = f"Inspection_Report_{int(time.time())}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
