import difflib
from typing import List
from utils.gemini_client import call_gemini
from config import CHECKLIST_ITEMS

COMPLETENESS_PROMPT = """You are a CDSCO regulatory reviewer assessing whether a submission document meets the requirements for the checklist type specified.

=== SCORING RULES ===
Mark each checklist item using these definitions:
  Present         — the item is clearly and adequately addressed in the document
  Partial         — the item is mentioned or partially addressed but lacks required detail, data, or format
  Missing         — the item is entirely absent from the document
  Not Applicable  — the item genuinely does not apply to this specific application (explain why in notes)

overall_completeness_pct: count only Present (1.0) and Partial (0.5) items; Missing = 0. Calculate as a percentage of total applicable items.

=== STATUS THRESHOLDS ===
  Complete       ≥ 90%
  Mostly Complete 70–89%
  Incomplete     50–69%
  Critical Gaps  < 50% OR any critical item is Missing

=== CRITICAL ITEMS ===
An item is critical if its absence would: (a) prevent safety assessment, (b) make the application non-reviewable under CDSCO/NDCT Rules, or (c) raise a patient safety concern. List these specifically in critical_missing.

=== NOTES GUIDANCE ===
For Partial or Missing items, the notes field must explain specifically what is present vs. what is lacking — not generic advice. E.g. "Phase II data provided but no Phase III trial results; bridging study for Indian population absent."

=== RECOMMENDATIONS ===
Each recommendation must be actionable and specific — name the missing section, the required format, and the applicable regulation if known.

reviewer_action: one of "Approve for Review", "Issue Deficiency Letter", "Return Application" — with a one-line reason.

Return ONLY valid JSON, no markdown, no commentary:
{{
  "overall_completeness_pct": integer 0-100,
  "status": "Complete"|"Mostly Complete"|"Incomplete"|"Critical Gaps",
  "items": [
    {{"item": "checklist item text", "status": "Present"|"Partial"|"Missing"|"Not Applicable", "notes": "specific explanation"}}
  ],
  "critical_missing": ["specific item that is critically absent"],
  "recommendations": ["actionable recommendation referencing applicable regulation"],
  "reviewer_action": "Action — reason"
}}

Checklist type: {checklist_type}
Checklist items to assess:
{checklist}

Submission document:
\"\"\"{text}\"\"\"
"""

COMPARISON_PROMPT = """You are a CDSCO regulatory reviewer comparing two versions of a regulatory document to identify changes and assess their regulatory significance.

=== CHANGE CLASSIFICATION ===
Type:
  Addition     — new content not present in Version 1
  Deletion     — content removed from Version 1
  Modification — content present in both but substantively changed
  Data Change  — numerical values, dates, sample sizes, or statistical parameters changed

Impact:
  High    — directly affects patient safety, primary endpoints, eligibility criteria, statistical validity, or requires formal regulatory amendment
  Medium  — affects study design, secondary objectives, or operational procedures; may require notification
  Low     — editorial, formatting, or administrative — no regulatory consequence

=== REGULATORY SIGNIFICANCE ===
For each significant change, state:
  - Whether it triggers a formal protocol amendment submission to CDSCO/EC under NDCT Rules 2019 or Schedule Y
  - Whether it affects the risk-benefit assessment or informed consent
  - Whether it requires ethics committee re-approval

=== OVERALL IMPACT ===
  Major    — one or more High-impact changes, especially to primary endpoints, eligibility, or sample size
  Moderate — predominantly Medium-impact changes; no fundamental redesign
  Minor    — Low-impact changes only; no regulatory submission needed

=== RECOMMENDATION ===
Be explicit: state whether a formal amendment is required, who must approve it, and any timeline.

Return ONLY valid JSON, no markdown, no commentary:
{{
  "change_summary": "2-3 sentence synthesis of what changed and why it matters",
  "significant_changes": [
    {{
      "section": "document section or clause reference",
      "type": "Addition"|"Deletion"|"Modification"|"Data Change",
      "description": "specific description of what changed",
      "impact": "High"|"Medium"|"Low",
      "regulatory_significance": "whether amendment required, who approves, any timeline"
    }}
  ],
  "data_changes": ["specific numerical/statistical change with before→after values"],
  "new_sections": ["section title — brief description"],
  "removed_sections": ["section title — brief description"],
  "overall_impact": "Major"|"Moderate"|"Minor",
  "recommendation": "specific regulatory action required with applicable rule/timeline"
}}

Version 1 (Original):
\"\"\"{text1}\"\"\"

Version 2 (Revised):
\"\"\"{text2}\"\"\"
"""


def assess_completeness(text: str, checklist_type: str, client, model_name: str) -> dict:
    checklist = CHECKLIST_ITEMS.get(checklist_type, [])
    prompt = COMPLETENESS_PROMPT.format(
        checklist_type=checklist_type,
        checklist="\n".join(f"- {i}" for i in checklist),
        text=text[:150000],
    )
    return call_gemini(client, model_name, prompt, fallback={"error": "Assessment failed"})


def compare_documents(text1: str, text2: str, client, model_name: str) -> dict:
    prompt = COMPARISON_PROMPT.format(text1=text1[:75000], text2=text2[:75000])
    return call_gemini(client, model_name, prompt, fallback={"error": "Comparison failed"})


def text_diff(text1: str, text2: str) -> List[str]:
    return list(difflib.unified_diff(
        text1.splitlines(keepends=True),
        text2.splitlines(keepends=True),
        fromfile="Version 1", tofile="Version 2", n=2,
    ))
