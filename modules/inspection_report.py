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

PROMPT = """You are a CDSCO-qualified pharmaceutical inspector writing a formal inspection report for official submission.
Convert the raw observations below into a structured report following CDSCO's standard format.

Inspection Type: {inspection_type}
Applicable Regulations: {reg_refs}

=== FINDING CLASSIFICATION DEFINITIONS ===
Critical    — deficiency likely to result in a serious risk to patient safety or public health; falsification of data; systemic failure that invalidates product batches or trial data; requires immediate action
Major       — substantial deficiency that may compromise product quality, patient safety, or data integrity, but does not pose an immediate risk; could become critical if uncorrected
Minor       — deficiency that does not compromise quality or safety but indicates imperfect adherence to GxP; requires correction
Observation — area noted for potential improvement; not a regulatory violation; no formal response required but good practice to address

=== FINDING ID FORMAT ===
Use a code that indicates the area, e.g.:
  OBS-ICF-001  (Informed Consent Form)
  OBS-CRF-001  (Case Report Form / data)
  OBS-DEV-001  (Protocol deviation / eligibility)
  OBS-DRUG-001 (Investigational product / dispensing)
  OBS-EC-001   (Ethics Committee)
  OBS-TRN-001  (Training / qualification)
  OBS-SOP-001  (SOPs / documentation)
  OBS-TEMP-001 (Temperature / storage — for GMP/GDP)
  OBS-LABEL-001(Labelling)
  OBS-QC-001   (Quality control / testing)

=== DESCRIPTION QUALITY STANDARD ===
Each finding description must:
  1. Name the specific subject/batch/document/person involved (anonymise patient IDs to IN-XXX-XXXX format if present)
  2. State the observed fact precisely (dates, values, counts if available)
  3. State what was required (reference the specific rule, SOP, or protocol requirement)
  4. State why this matters (patient safety risk or data integrity consequence)

=== PROPOSED CAPA QUALITY STANDARD ===
Each CAPA must specify:
  - Immediate corrective action (what must be done now)
  - Root cause investigation required (yes/no, and what to investigate)
  - Preventive measure (systemic change to prevent recurrence)
  - Suggested timeline (e.g. "within 7 days", "within 30 days", "at next training cycle")

=== COMPLIANCE DETERMINATION ===
  Compliant               — no Critical or Major findings; Minor findings noted for correction
  Conditionally Compliant — Major findings present; CAPA accepted within specified timeframe
  Non-Compliant           — Critical findings present; or persistent non-compliance; or data integrity concerns

=== FOLLOW-UP TIMELINE ===
  Critical findings: CAPA response within 15 working days
  Major findings:    CAPA response within 30 days
  Minor only:        Response within 60 days or at next scheduled inspection

Return ONLY valid JSON, no markdown, no commentary:
{{
  "report_header": {{
    "inspection_type": "{inspection_type}",
    "facility_name": "full facility name",
    "facility_address": "city/address as stated",
    "inspection_date": "date or date range",
    "inspectors": ["Inspector Name — designation/organisation"],
    "report_date": "date report finalised"
  }},
  "executive_summary": "3-4 sentences: what was inspected, key deficiency themes, overall compliance conclusion, and immediate implications",
  "findings": [
    {{
      "finding_id": "OBS-XXX-001",
      "category": "Critical"|"Major"|"Minor"|"Observation",
      "description": "specific finding per quality standard above",
      "regulatory_reference": "exact rule/section/clause violated",
      "risk_level": "High"|"Medium"|"Low",
      "corrective_action_required": true|false,
      "proposed_capa": "immediate action + root cause investigation + preventive measure + timeline"
    }}
  ],
  "gmp_compliance": "Compliant"|"Conditionally Compliant"|"Non-Compliant",
  "critical_findings_count": integer,
  "major_findings_count": integer,
  "minor_findings_count": integer,
  "overall_assessment": "2-3 sentences on systemic compliance posture, risk to subjects/data, and any patterns across findings",
  "recommendations": ["specific actionable recommendation — name the responsible party and timeline"],
  "follow_up_required": true|false,
  "follow_up_timeline": "specific timeline per classification rules above"
}}

Raw Observations:
\"\"\"{text}\"\"\"
"""


def generate_inspection_report(text: str, report_type: str, client, model_name: str) -> dict:
    reg_refs = _REG_REFS.get(report_type, _REG_REFS["GMP Inspection"])
    prompt = PROMPT.format(
        inspection_type=report_type,
        reg_refs=reg_refs,
        text=text[:150000],
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
