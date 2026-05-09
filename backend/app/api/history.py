import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, StreamingResponse

router = APIRouter()


def _get_db():
    try:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))
        from database import get_session, ProcessingJob, DocumentResult, S3Artifact
        return get_session(), ProcessingJob, DocumentResult, S3Artifact
    except Exception:
        return None, None, None, None


@router.get("/history")
def list_history(
    module: str = Query("", description="Filter by module name"),
    limit:  int = Query(50, ge=1, le=200),
):
    """List recent processing jobs with their result JSON for the history page."""
    session, ProcessingJob, DocumentResult, S3Artifact = _get_db()
    if session is None:
        return {"jobs": []}
    try:
        q = session.query(ProcessingJob)
        if module:
            q = q.filter(ProcessingJob.module == module)
        jobs = q.order_by(ProcessingJob.created_at.desc()).limit(limit).all()

        result = []
        for job in jobs:
            # Fetch stored result if available
            doc_result = (
                session.query(DocumentResult)
                .filter(DocumentResult.job_id == job.job_id)
                .first()
            )
            result.append({
                "job_id":     job.job_id,
                "module":     job.module,
                "doc_type":   job.doc_type or "",
                "filename":   job.filename or "",
                "status":     job.status,
                "created_at": job.created_at.isoformat() if job.created_at else "",
                "duration_ms":job.duration_ms or 0,
                "has_result": doc_result is not None,
            })
        return {"jobs": result}
    except Exception as e:
        return {"jobs": [], "error": str(e)}
    finally:
        session.close()


@router.get("/history/{job_id}")
def get_history_item(job_id: str):
    """Get full details of a job including its stored result JSON."""
    session, ProcessingJob, DocumentResult, _ = _get_db()
    if session is None:
        raise HTTPException(503, "Database unavailable")
    try:
        job = session.query(ProcessingJob).filter(ProcessingJob.job_id == job_id).first()
        if not job:
            raise HTTPException(404, f"Job {job_id} not found")
        doc_result = (
            session.query(DocumentResult)
            .filter(DocumentResult.job_id == job_id)
            .first()
        )
        return {
            "job_id":     job.job_id,
            "module":     job.module,
            "doc_type":   job.doc_type or "",
            "filename":   job.filename or "",
            "status":     job.status,
            "created_at": job.created_at.isoformat() if job.created_at else "",
            "duration_ms":job.duration_ms or 0,
            "result":     doc_result.result if doc_result else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        session.close()


@router.get("/history/{job_id}/download/txt")
def download_txt(job_id: str):
    """Generate and return a plain-text download of the stored result."""
    session, ProcessingJob, DocumentResult, _ = _get_db()
    if session is None:
        raise HTTPException(503, "Database unavailable")
    try:
        job = session.query(ProcessingJob).filter(ProcessingJob.job_id == job_id).first()
        if not job:
            raise HTTPException(404, f"Job {job_id} not found")
        doc_result = (
            session.query(DocumentResult)
            .filter(DocumentResult.job_id == job_id)
            .first()
        )
        if not doc_result or not doc_result.result:
            raise HTTPException(404, "No result found for this job")

        content = _format_as_text(job.module, job.doc_type or "", doc_result.result, job.job_id, job.created_at)
        filename = f"CDSCO_{job.module}_{job_id}.txt"
        return Response(
            content=content.encode("utf-8"),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        session.close()


@router.get("/history/{job_id}/download/pdf")
def download_pdf(job_id: str):
    """Generate and return a PDF download of the stored result."""
    session, ProcessingJob, DocumentResult, _ = _get_db()
    if session is None:
        raise HTTPException(503, "Database unavailable")
    try:
        job = session.query(ProcessingJob).filter(ProcessingJob.job_id == job_id).first()
        if not job:
            raise HTTPException(404, f"Job {job_id} not found")
        doc_result = (
            session.query(DocumentResult)
            .filter(DocumentResult.job_id == job_id)
            .first()
        )
        if not doc_result or not doc_result.result:
            raise HTTPException(404, "No result found for this job")

        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))
        from utils.pdf_export import generate_pdf

        pdf_bytes = generate_pdf(
            module=job.module,
            doc_type=job.doc_type or "",
            result=doc_result.result,
            job_id=job.job_id,
            created_at=job.created_at.isoformat() if job.created_at else "",
        )
        filename = f"CDSCO_{job.module}_{job_id}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        session.close()


def _format_as_text(module: str, doc_type: str, result: dict, job_id: str, created_at) -> str:
    sep = "=" * 60
    sub = "-" * 40
    ts  = created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at or "")
    lines = [
        sep,
        "CDSCO RegAI — Result Export",
        f"Module  : {module}",
        f"Type    : {doc_type}",
        f"Job ID  : {job_id}",
        f"Date    : {ts}",
        sep, "",
    ]

    if module == "summarisation":
        if doc_type == "SUGAM Application":
            for k, label in [
                ("application_type","Application Type"), ("sub_type","Sub-Type"),
                ("applicant","Applicant"), ("product","Product"),
                ("regulatory_status","Regulatory Status"), ("recommendation","Recommendation"),
            ]:
                if result.get(k): lines.append(f"{label}: {result[k]}")
            lines.append("")
            for k, label in [("clinical_data_summary","CLINICAL DATA SUMMARY"),
                              ("safety_profile","SAFETY PROFILE"), ("reviewer_notes","REVIEWER NOTES")]:
                if result.get(k): lines += [label, sub, result[k], ""]
            if result.get("checklist_status"):
                lines += ["CHECKLIST STATUS", sub]
                for c in result["checklist_status"]:
                    lines.append(f"  [{c.get('status','')}] {c.get('item','')} — {c.get('note','')}")
                lines.append("")
            if result.get("missing_information"):
                lines += ["MISSING INFORMATION", sub]
                for i, m in enumerate(result["missing_information"], 1): lines.append(f"  {i}. {m}")
        elif doc_type == "SAE Case Narration":
            for k, label in [("case_id","Case ID"),("suspect_drug","Suspect Drug"),
                              ("onset_date","Onset Date"),("outcome","Outcome"),
                              ("causality","Causality"),("resolution_status","Resolution")]:
                if result.get(k): lines.append(f"{label}: {result[k]}")
            lines.append("")
            for k, label in [("patient_profile","PATIENT PROFILE"),("event","EVENT"),
                              ("case_summary","CASE SUMMARY")]:
                if result.get(k): lines += [label, sub, result[k], ""]
            if result.get("seriousness_criteria"):
                lines += ["SERIOUSNESS CRITERIA", sub]
                for c in result["seriousness_criteria"]: lines.append(f"  · {c}")
        else:
            for k, label in [("meeting_type","Meeting Type"),("meeting_date","Date")]:
                if result.get(k): lines.append(f"{label}: {result[k]}")
            lines.append("")
            if result.get("executive_summary"): lines += ["EXECUTIVE SUMMARY", sub, result["executive_summary"],""]
            if result.get("key_decisions"):
                lines += ["KEY DECISIONS", sub]
                for i,d in enumerate(result["key_decisions"],1): lines.append(f"  {i}. {d}")
            if result.get("action_items"):
                lines += ["", "ACTION ITEMS", sub]
                for a in result["action_items"]:
                    if isinstance(a, dict): lines.append(f"  · {a.get('action','')} [{a.get('owner','TBD')} · {a.get('deadline','TBD')}]")
                    else: lines.append(f"  · {a}")

    elif module == "inspection_report":
        from modules.inspection_report import format_report_as_text
        return format_report_as_text(result)

    elif module == "classification":
        for k, label in [("case_id","Case ID"),("severity_class","Severity"),
                          ("priority","Priority"),("outcome","Outcome"),
                          ("drug_suspect","Suspect Drug"),("event_pt","MedDRA Term"),
                          ("causality_assessment","Causality")]:
            if result.get(k): lines.append(f"{label}: {result[k]}")
        if result.get("seriousness_criteria"):
            lines += ["", "SERIOUSNESS CRITERIA", sub]
            for c in result["seriousness_criteria"]: lines.append(f"  · {c}")
        if result.get("reviewer_priority_notes"):
            lines += ["", "REVIEWER NOTES", sub, result["reviewer_priority_notes"]]

    elif module == "completeness":
        pct = result.get("overall_completeness_pct") or round((result.get("score",0) or 0)*100)
        lines += [f"Completeness: {pct}%", f"Status: {result.get('status','')}", ""]
        if result.get("items"):
            lines += ["CHECKLIST ITEMS", sub]
            for item in result["items"]:
                mark = "✓" if item.get("status")=="Present" else ("~" if item.get("status")=="Partial" else ("N/A" if item.get("status")=="Not Applicable" else "✗"))
                lines.append(f"  [{mark}] {item.get('item','')} — {item.get('notes','')} ({item.get('status','')})")
        if result.get("critical_missing"):
            lines += ["", "CRITICAL MISSING", sub]
            for i, m in enumerate(result["critical_missing"],1): lines.append(f"  {i}. {m}")

    elif module == "anonymisation":
        lines.append(f"Total Entities Redacted: {result.get('total_entities',0)}")
        lines += ["", "ANONYMISED TEXT", sub, result.get("anonymized_text","")]

    elif module == "comparison":
        lines += [f"Overall Impact: {result.get('overall_impact','')}", f"Recommendation: {result.get('recommendation','')}",""]
        if result.get("change_summary"): lines += ["CHANGE SUMMARY", sub, result["change_summary"],""]

    else:
        import json
        lines.append(json.dumps(result, indent=2))

    return "\n".join(lines)
