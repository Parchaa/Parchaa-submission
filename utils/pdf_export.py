"""
PDF export for history downloads — converts stored result JSON to a clean PDF.
Uses reportlab (already installed: reportlab 4.4.10).
"""
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER


_NAVY   = colors.HexColor("#1e3a5f")
_ACCENT = colors.HexColor("#4f8ef7")
_GREY   = colors.HexColor("#6b7280")
_LIGHT  = colors.HexColor("#f3f4f6")
_RED    = colors.HexColor("#ef4444")
_ORANGE = colors.HexColor("#f59e0b")
_GREEN  = colors.HexColor("#10b981")


def _styles():
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=16, textColor=_NAVY,
                             spaceAfter=4, leading=20),
        "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12, textColor=_NAVY,
                             spaceBefore=12, spaceAfter=4, leading=15),
        "h3": ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=10, textColor=_ACCENT,
                             spaceBefore=8, spaceAfter=3, leading=13),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9, textColor=colors.black,
                               spaceAfter=4, leading=13),
        "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8, textColor=_GREY,
                                spaceAfter=2, leading=11),
        "mono": ParagraphStyle("mono", fontName="Courier", fontSize=8, textColor=_NAVY,
                               spaceAfter=2, leading=12),
        "center": ParagraphStyle("center", fontName="Helvetica", fontSize=9, alignment=TA_CENTER,
                                 textColor=_GREY),
    }


def _header(story, s, module_label: str, doc_type: str, job_id: str, created_at: str):
    story.append(Paragraph("CDSCO RegAI — Regulatory AI Platform", s["small"]))
    story.append(Paragraph(module_label, s["h1"]))
    if doc_type:
        story.append(Paragraph(doc_type, s["h3"]))
    meta = [
        ["Job ID", job_id or "—"],
        ["Generated", created_at or datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")],
    ]
    t = Table(meta, colWidths=[3*cm, 12*cm])
    t.setStyle(TableStyle([
        ("FONTNAME",    (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE",    (0,0), (-1,-1), 8),
        ("TEXTCOLOR",   (0,0), (0,-1), _GREY),
        ("TEXTCOLOR",   (1,0), (1,-1), colors.black),
        ("TOPPADDING",  (0,0), (-1,-1), 2),
        ("BOTTOMPADDING",(0,0),(-1,-1), 2),
    ]))
    story.append(t)
    story.append(HRFlowable(width="100%", thickness=1, color=_ACCENT, spaceAfter=10))


def _kv_table(story, s, rows):
    """Render a list of [label, value] pairs as a styled table."""
    if not rows:
        return
    t = Table(rows, colWidths=[5*cm, 11*cm])
    t.setStyle(TableStyle([
        ("FONTNAME",     (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("TEXTCOLOR",    (0,0), (0,-1), _GREY),
        ("FONTNAME",     (0,0), (0,-1), "Helvetica-Bold"),
        ("TEXTCOLOR",    (1,0), (1,-1), colors.black),
        ("BACKGROUND",   (0,0), (-1,-1), _LIGHT),
        ("ROWBACKGROUNDS",(0,0),(-1,-1),[_LIGHT, colors.white]),
        ("TOPPADDING",   (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0),(-1,-1), 4),
        ("LEFTPADDING",  (0,0), (-1,-1), 6),
        ("GRID",         (0,0), (-1,-1), 0.25, colors.HexColor("#e5e7eb")),
    ]))
    story.append(t)
    story.append(Spacer(1, 8))


def _bullet_list(story, s, items, color=None):
    for item in (items or []):
        txt = str(item) if not isinstance(item, dict) else str(item)
        story.append(Paragraph(f"• {txt}", s["body"]))


def generate_pdf(module: str, doc_type: str, result: dict,
                 job_id: str = "", created_at: str = "") -> bytes:
    """Generate a PDF report from a module result dict. Returns PDF bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    s = _styles()
    story = []

    MODULE_LABELS = {
        "summarisation":     "Document Summarisation Report",
        "inspection_report": "CDSCO Inspection Report",
        "classification":    "SAE Classification Report",
        "completeness":      "Document Completeness Assessment",
        "anonymisation":     "PII/PHI Anonymisation Report",
        "comparison":        "Document Comparison Report",
    }
    label = MODULE_LABELS.get(module, f"{module.title()} Report")
    _header(story, s, label, doc_type, job_id, created_at)

    if module == "summarisation":
        _pdf_summarisation(story, s, doc_type, result)
    elif module == "inspection_report":
        _pdf_inspection(story, s, result)
    elif module == "classification":
        _pdf_classification(story, s, result)
    elif module == "completeness":
        _pdf_completeness(story, s, result)
    elif module == "anonymisation":
        _pdf_anonymisation(story, s, result)
    elif module == "comparison":
        _pdf_comparison(story, s, result)
    else:
        story.append(Paragraph("Result data:", s["h2"]))
        import json
        story.append(Paragraph(json.dumps(result, indent=2)[:3000], s["mono"]))

    doc.build(story)
    return buf.getvalue()


def _pdf_summarisation(story, s, doc_type, d):
    if doc_type == "SUGAM Application":
        story.append(Paragraph("Application Overview", s["h2"]))
        _kv_table(story, s, [r for r in [
            ["Application Type",  d.get("application_type", "")],
            ["Sub-Type",          d.get("sub_type", "")],
            ["Applicant",         d.get("applicant", "")],
            ["Product",           d.get("product", "")],
            ["Regulatory Status", d.get("regulatory_status", "")],
            ["Recommendation",    d.get("recommendation", "")],
        ] if r[1]])
        for section, key in [
            ("Clinical Data Summary", "clinical_data_summary"),
            ("Safety Profile",        "safety_profile"),
            ("Reviewer Notes",        "reviewer_notes"),
        ]:
            if d.get(key):
                story.append(Paragraph(section, s["h3"]))
                story.append(Paragraph(d[key], s["body"]))
        if d.get("key_claims"):
            story.append(Paragraph("Key Claims", s["h3"]))
            _bullet_list(story, s, d["key_claims"])
        if d.get("checklist_status"):
            story.append(Paragraph("Checklist Status", s["h3"]))
            rows = [["Item", "Status", "Note"]]
            for item in d["checklist_status"]:
                rows.append([item.get("item",""), item.get("status",""), item.get("note","")])
            t = Table(rows, colWidths=[7*cm, 2.5*cm, 6.5*cm])
            STATUS_COLORS = {"Present": _GREEN, "Absent": _RED, "Partial": _ORANGE}
            style = [
                ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
                ("FONTSIZE",    (0,0), (-1,-1), 8),
                ("BACKGROUND",  (0,0), (-1,0), _NAVY),
                ("TEXTCOLOR",   (0,0), (-1,0), colors.white),
                ("GRID",        (0,0), (-1,-1), 0.25, colors.HexColor("#e5e7eb")),
                ("TOPPADDING",  (0,0), (-1,-1), 3),
                ("BOTTOMPADDING",(0,0),(-1,-1), 3),
                ("LEFTPADDING", (0,0), (-1,-1), 5),
            ]
            for i, item in enumerate(d["checklist_status"], 1):
                c = STATUS_COLORS.get(item.get("status",""), _GREY)
                style.append(("TEXTCOLOR", (1,i), (1,i), c))
                style.append(("FONTNAME",  (1,i), (1,i), "Helvetica-Bold"))
            t.setStyle(TableStyle(style))
            story.append(t)
            story.append(Spacer(1, 8))
        if d.get("missing_information"):
            story.append(Paragraph("Missing Information", s["h3"]))
            _bullet_list(story, s, d["missing_information"])
    elif doc_type == "SAE Case Narration":
        story.append(Paragraph("Case Overview", s["h2"]))
        _kv_table(story, s, [r for r in [
            ["Case ID",      d.get("case_id","")],
            ["Suspect Drug", d.get("suspect_drug","")],
            ["Onset Date",   d.get("onset_date","")],
            ["Outcome",      d.get("outcome","")],
            ["Causality",    d.get("causality","")],
            ["Resolution",   d.get("resolution_status","")],
        ] if r[1]])
        for section, key in [
            ("Patient Profile",   "patient_profile"),
            ("Event Description", "event"),
            ("Case Summary",      "case_summary"),
        ]:
            if d.get(key):
                story.append(Paragraph(section, s["h3"]))
                story.append(Paragraph(d[key], s["body"]))
        if d.get("seriousness_criteria"):
            story.append(Paragraph("Seriousness Criteria (ICH E2A)", s["h3"]))
            _bullet_list(story, s, d["seriousness_criteria"])
        if d.get("reporting_timeline"):
            story.append(Paragraph("Reporting Timeline", s["h3"]))
            story.append(Paragraph(d["reporting_timeline"], s["body"]))
    else:  # Meeting
        story.append(Paragraph("Meeting Overview", s["h2"]))
        _kv_table(story, s, [r for r in [
            ["Meeting Type", d.get("meeting_type","")],
            ["Date",         d.get("meeting_date","")],
        ] if r[1]])
        if d.get("executive_summary"):
            story.append(Paragraph("Executive Summary", s["h3"]))
            story.append(Paragraph(d["executive_summary"], s["body"]))
        if d.get("key_decisions"):
            story.append(Paragraph("Key Decisions", s["h3"]))
            _bullet_list(story, s, d["key_decisions"])
        if d.get("action_items"):
            story.append(Paragraph("Action Items", s["h3"]))
            for a in d["action_items"]:
                if isinstance(a, dict):
                    story.append(Paragraph(f"• {a.get('action','')} — Owner: {a.get('owner','TBD')} · Due: {a.get('deadline','TBD')}", s["body"]))
                else:
                    story.append(Paragraph(f"• {a}", s["body"]))
        if d.get("next_steps"):
            story.append(Paragraph("Next Steps", s["h3"]))
            _bullet_list(story, s, d["next_steps"])


def _pdf_inspection(story, s, d):
    h = d.get("report_header", {})
    story.append(Paragraph("Facility & Inspection Details", s["h2"]))
    _kv_table(story, s, [r for r in [
        ["Inspection Type",  h.get("inspection_type","")],
        ["Facility",         h.get("facility_name","")],
        ["Address",          h.get("facility_address","")],
        ["Inspection Date",  h.get("inspection_date","")],
        ["Report Date",      h.get("report_date","")],
        ["Inspectors",       ", ".join(h.get("inspectors",[]))],
        ["Compliance",       d.get("gmp_compliance","")],
    ] if r[1]])

    sc = d.get("scope", {})
    if sc.get("summary"):
        story.append(Paragraph("Scope of Inspection", s["h2"]))
        story.append(Paragraph(sc["summary"], s["body"]))
        if sc.get("systems_covered"):
            story.append(Paragraph("Systems Covered: " + ", ".join(sc["systems_covered"]), s["small"]))

    if d.get("executive_summary"):
        story.append(Paragraph("Executive Summary", s["h2"]))
        story.append(Paragraph(d["executive_summary"], s["body"]))

    FINDING_COLORS = {"Critical": _RED, "Major": _ORANGE, "Minor": _ACCENT, "Observation": _GREY}
    if d.get("findings"):
        story.append(Paragraph("Findings", s["h2"]))
        for f in d["findings"]:
            cat = f.get("category","")
            col = FINDING_COLORS.get(cat, _GREY)
            story.append(Paragraph(f"[{f.get('finding_id','')}] {cat} — Risk: {f.get('risk_level','')}", s["h3"]))
            if f.get("area"):
                story.append(Paragraph(f"Area: {f['area']}", s["small"]))
            story.append(Paragraph(f.get("description",""), s["body"]))
            if f.get("regulatory_reference"):
                story.append(Paragraph(f"Reference: {f['regulatory_reference']}", s["small"]))
            if f.get("proposed_capa"):
                story.append(Paragraph(f"CAPA: {f['proposed_capa']}", s["small"]))
            story.append(Spacer(1, 4))

    if d.get("recommendations"):
        story.append(Paragraph("Recommendations", s["h2"]))
        _bullet_list(story, s, d["recommendations"])


def _pdf_classification(story, s, d):
    story.append(Paragraph("Classification Result", s["h2"]))
    _kv_table(story, s, [r for r in [
        ["Case ID",        d.get("case_id","")],
        ["Severity Class", d.get("severity_class","")],
        ["Priority",       d.get("priority","")],
        ["Outcome",        d.get("outcome","")],
        ["Suspect Drug",   d.get("drug_suspect","")],
        ["MedDRA Term",    d.get("event_pt","")],
        ["Causality",      d.get("causality_assessment","")],
        ["Severity Score", str(d.get("severity_score","")) + "/10" if d.get("severity_score") else ""],
    ] if r[1]])
    if d.get("seriousness_criteria"):
        story.append(Paragraph("Seriousness Criteria (ICH E2A)", s["h3"]))
        _bullet_list(story, s, d["seriousness_criteria"])
    if d.get("reviewer_priority_notes"):
        story.append(Paragraph("Reviewer Notes", s["h3"]))
        story.append(Paragraph(d["reviewer_priority_notes"], s["body"]))


def _pdf_completeness(story, s, d):
    pct = d.get("overall_completeness_pct") or round((d.get("score",0) or 0) * 100)
    story.append(Paragraph("Completeness Score", s["h2"]))
    _kv_table(story, s, [r for r in [
        ["Checklist Type", d.get("checklist_type","")],
        ["Score",          f"{pct}%"],
        ["Status",         d.get("status","")],
        ["Action",         d.get("reviewer_action","")],
    ] if r[1]])
    if d.get("items"):
        story.append(Paragraph("Checklist Items", s["h3"]))
        rows = [["Item", "Status", "Notes"]]
        for item in d["items"]:
            rows.append([item.get("item",""), item.get("status",""), item.get("notes","")])
        t = Table(rows, colWidths=[8*cm, 2.5*cm, 5.5*cm])
        t.setStyle(TableStyle([
            ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,-1), 8),
            ("BACKGROUND",  (0,0), (-1,0), _NAVY),
            ("TEXTCOLOR",   (0,0), (-1,0), colors.white),
            ("GRID",        (0,0), (-1,-1), 0.25, colors.HexColor("#e5e7eb")),
            ("TOPPADDING",  (0,0), (-1,-1), 3),
            ("BOTTOMPADDING",(0,0),(-1,-1), 3),
            ("LEFTPADDING", (0,0), (-1,-1), 5),
        ]))
        story.append(t)
        story.append(Spacer(1,8))
    if d.get("critical_missing"):
        story.append(Paragraph("Critical — Must Fix Before Approval", s["h3"]))
        _bullet_list(story, s, d["critical_missing"])


def _pdf_anonymisation(story, s, d):
    story.append(Paragraph("Anonymisation Summary", s["h2"]))
    _kv_table(story, s, [
        ["Total Entities Redacted", str(d.get("total_entities", 0))],
    ])
    story.append(Paragraph("Anonymised Text", s["h3"]))
    text = d.get("anonymized_text","")
    # Limit to 3000 chars in PDF
    if len(text) > 3000:
        text = text[:3000] + "\n\n[...truncated in PDF — download TXT for full output]"
    story.append(Paragraph(text.replace("\n", "<br/>"), s["body"]))


def _pdf_comparison(story, s, d):
    story.append(Paragraph("Comparison Summary", s["h2"]))
    _kv_table(story, s, [r for r in [
        ["Overall Impact",  d.get("overall_impact","")],
        ["Recommendation",  d.get("recommendation","")],
    ] if r[1]])
    if d.get("change_summary"):
        story.append(Paragraph("Change Summary", s["h3"]))
        story.append(Paragraph(d["change_summary"], s["body"]))
    if d.get("significant_changes"):
        story.append(Paragraph("Significant Changes", s["h3"]))
        for c in d["significant_changes"]:
            story.append(Paragraph(f"[{c.get('section','')}] {c.get('type','')} — {c.get('impact','')} Impact", s["h3"]))
            story.append(Paragraph(c.get("description",""), s["body"]))
