import difflib
from typing import List
from utils.gemini_client import call_gemini
from config import CHECKLIST_ITEMS

COMPLETENESS_PROMPT = """Check this document against the regulatory checklist. Return JSON:
{{
  "overall_completeness_pct": integer 0-100,
  "status": "Complete"|"Mostly Complete"|"Incomplete"|"Critical Gaps",
  "items": [{{"item":"...","status":"Present"|"Partial"|"Missing"|"Not Applicable","notes":"..."}}],
  "critical_missing": ["..."],
  "recommendations": ["..."],
  "reviewer_action": "..."
}}

Checklist ({checklist_type}):
{checklist}

Document:\"\"\"{text}\"\"\"
"""

COMPARISON_PROMPT = """Compare two versions of a regulatory filing. Return JSON:
{{
  "change_summary": "...",
  "significant_changes": [{{"section":"...","type":"Addition"|"Deletion"|"Modification"|"Data Change","description":"...","impact":"High"|"Medium"|"Low","regulatory_significance":"..."}}],
  "data_changes": ["..."],
  "new_sections": ["..."],
  "removed_sections": ["..."],
  "overall_impact": "Major"|"Moderate"|"Minor",
  "recommendation": "..."
}}

Version 1:\"\"\"{text1}\"\"\"
Version 2:\"\"\"{text2}\"\"\"
"""


def assess_completeness(text: str, checklist_type: str, client, model_name: str) -> dict:
    checklist = CHECKLIST_ITEMS.get(checklist_type, [])
    prompt = COMPLETENESS_PROMPT.format(
        checklist_type=checklist_type,
        checklist="\n".join(f"- {i}" for i in checklist),
        text=text[:25000],
    )
    return call_gemini(client, model_name, prompt, fallback={"error": "Assessment failed"})


def compare_documents(text1: str, text2: str, client, model_name: str) -> dict:
    prompt = COMPARISON_PROMPT.format(text1=text1[:14000], text2=text2[:14000])
    return call_gemini(client, model_name, prompt, fallback={"error": "Comparison failed"})


def text_diff(text1: str, text2: str) -> List[str]:
    return list(difflib.unified_diff(
        text1.splitlines(keepends=True),
        text2.splitlines(keepends=True),
        fromfile="Version 1", tofile="Version 2", n=2,
    ))
