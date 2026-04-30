from utils.gemini_client import call_gemini

# Regulatory references by inspection type for grounding the findings
_REG_REFS = {
    "GMP Inspection": (
        "Schedule M (GMP for premises and materials), Drugs & Cosmetics Act 1940, "
        "WHO GMP TRS 986, ICH Q7, Q10. Reference sections as Schedule M Rule numbers."
    ),
    "GCP Inspection": (
        "ICH E6(R2) Good Clinical Practice, CDSCO GCP Guidelines 2001, "
        "Schedule Y (clinical trial requirements). Reference ICH E6 sections."
    ),
    "GDP Inspection": (
        "WHO GDP Guidelines (TRS 957), CDSCO distribution guidelines. "
        "Reference WHO annex numbers."
    ),
    "Pharmacovigilance Audit": (
        "CDSCO Pharmacovigilance Programme of India (PvPI), ICH E2A, E2C, E2E, "
        "Schedule Y adverse event reporting requirements."
    ),
    "Clinical Trial Site Audit": (
        "CDSCO GCP guidelines, ICH E6(R2), Schedule Y, New Drugs and Clinical Trials Rules 2019. "
        "Reference NDCT Rules clause numbers."
    ),
}

PROMPT = """You are a CDSCO-qualified pharmaceutical inspector writing a formal inspection report.
Convert the raw observations below into a structured report following CDSCO's official format.

Inspection Type: {inspection_type}
Applicable Regulations: {reg_refs}

Classification definitions:
  Critical — deficiency that may cause serious harm to patient safety or product quality, or is a major fraud/falsification
  Major    — substantial deficiency that may compromise product quality or patient safety
  Minor    — deficiency not likely to cause harm but requires correction
  Observation — area of concern noted for improvement

Return JSON exactly:
{{
  "report_header": {{
    "inspection_type": "{inspection_type}",
    "facility_name": "...",
    "facility_address": "...",
    "inspection_date": "...",
    "inspectors": ["..."],
    "report_date": "..."
  }},
  "executive_summary": "...",
  "findings": [{{
    "finding_id": "F-001",
    "category": "Critical"|"Major"|"Minor"|"Observation",
    "description": "...",
    "regulatory_reference": "specific rule/section violated",
    "risk_level": "High"|"Medium"|"Low",
    "corrective_action_required": true,
    "proposed_capa": "specific corrective and preventive action"
  }}],
  "gmp_compliance": "Compliant"|"Conditionally Compliant"|"Non-Compliant",
  "critical_findings_count": 0,
  "major_findings_count": 0,
  "minor_findings_count": 0,
  "overall_assessment": "...",
  "recommendations": ["..."],
  "follow_up_required": true,
  "follow_up_timeline": "e.g. 30 days for CAPA submission"
}}

Raw Observations:
\"\"\"{text}\"\"\"
"""


def generate_inspection_report(text: str, report_type: str, client, model_name: str) -> dict:
    reg_refs = _REG_REFS.get(report_type, _REG_REFS["GMP Inspection"])
    prompt = PROMPT.format(
        inspection_type=report_type,
        reg_refs=reg_refs,
        text=text[:24000],
    )
    result = call_gemini(client, model_name, prompt, fallback={"error": "Report generation failed"})
    # Populate count fields if Gemini didn't fill them
    if "findings" in result and isinstance(result["findings"], list):
        cats = [f.get("category", "") for f in result["findings"]]
        result.setdefault("critical_findings_count", cats.count("Critical"))
        result.setdefault("major_findings_count", cats.count("Major"))
        result.setdefault("minor_findings_count", cats.count("Minor"))
    return result


def format_report_as_text(report: dict) -> str:
    h = report.get("report_header", {})
    lines = [
        "=" * 70,
        "CENTRAL DRUGS STANDARD CONTROL ORGANISATION (CDSCO)",
        "INSPECTION REPORT",
        "=" * 70,
        f"Inspection Type : {h.get('inspection_type','N/A')}",
        f"Facility Name   : {h.get('facility_name','N/A')}",
        f"Address         : {h.get('facility_address','N/A')}",
        f"Inspection Date : {h.get('inspection_date','N/A')}",
        f"Report Date     : {h.get('report_date','N/A')}",
        f"Inspectors      : {', '.join(h.get('inspectors',[])) or 'N/A'}",
        "",
        "EXECUTIVE SUMMARY",
        "-" * 40,
        report.get("executive_summary",""),
        "",
        f"GMP Compliance: {report.get('gmp_compliance','N/A')}",
        f"Findings: {report.get('critical_findings_count',0)} Critical | "
        f"{report.get('major_findings_count',0)} Major | "
        f"{report.get('minor_findings_count',0)} Minor",
        "",
        "DETAILED FINDINGS",
        "-" * 40,
    ]
    for f in report.get("findings", []):
        lines += [
            f"\n[{f.get('finding_id','')}] {f.get('category','').upper()} — Risk: {f.get('risk_level','')}",
            f"  Description    : {f.get('description','')}",
            f"  Regulatory Ref : {f.get('regulatory_reference','')}",
        ]
        if f.get("corrective_action_required"):
            lines.append(f"  CAPA           : {f.get('proposed_capa','')}")
    lines += [
        "", "OVERALL ASSESSMENT", "-" * 40,
        report.get("overall_assessment",""),
        "", "RECOMMENDATIONS", "-" * 40,
    ]
    for i, r in enumerate(report.get("recommendations",[]), 1):
        lines.append(f"  {i}. {r}")
    fu = report.get("follow_up_required", False)
    lines.append(f"\nFollow-up: {'Yes — ' + report.get('follow_up_timeline','') if fu else 'No'}")
    lines.append("=" * 70)
    return "\n".join(lines)
