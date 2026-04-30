"""SAE classification + duplicate detection with TF-IDF cosine pre-filter."""
from typing import List
from utils.gemini_client import call_gemini
from utils.pii_rules import cosine_similarity

CLASSIFY_PROMPT = """Classify this SAE/case report.

Return JSON:
{{
  "case_id": "extracted or generated reference",
  "severity_class": one of ["Death","Life-Threatening","Hospitalisation Required","Persistent Disability/Incapacity","Congenital Anomaly/Birth Defect","Medically Important Event","Other Non-Serious"],
  "severity_score": integer 1-10,
  "priority": "URGENT"|"HIGH"|"MEDIUM"|"LOW",
  "seriousness_criteria": [list of applicable ICH E2A criteria],
  "causality_assessment": "Certain"|"Probable/Likely"|"Possible"|"Unlikely"|"Conditional"|"Unassessable",
  "drug_suspect": "primary suspect drug name",
  "event_pt": "MedDRA Preferred Term",
  "outcome": "Recovered/Resolved"|"Recovering"|"Not Recovered"|"Fatal"|"Unknown",
  "duplicate_risk": "High"|"Medium"|"Low",
  "duplicate_indicators": [fields suggesting duplicate],
  "flags": [special flags e.g. "Paediatric case","Pregnancy","Off-label use"],
  "reviewer_priority_notes": "2-sentence note for reviewer"
}}

Case:
\"\"\"{text}\"\"\"
"""

DUPLICATE_PROMPT = """Are these two SAE cases duplicates of the same event?

Return JSON:
{{
  "is_duplicate": true|false,
  "similarity_score": float 0.0-1.0,
  "matching_elements": [list of matching fields],
  "differing_elements": [list of differing fields],
  "reasoning": "brief explanation"
}}

Case 1: \"\"\"{text1}\"\"\"
Case 2: \"\"\"{text2}\"\"\"
"""

BATCH_PROMPT = """Classify these SAE reports. Return a JSON array, one object per report:
{{
  "index": 0-based,
  "case_id": "reference",
  "severity_class": "...",
  "severity_score": 1-10,
  "priority": "URGENT"|"HIGH"|"MEDIUM"|"LOW",
  "outcome": "...",
  "potential_duplicate_of": [indices],
  "duplicate_confidence": "High"|"Medium"|"Low"|"None"
}}

Reports:
{reports}
"""


def classify_single(text: str, client, model_name: str) -> dict:
    return call_gemini(client, model_name, CLASSIFY_PROMPT.format(text=text[:20000]), fallback={
        "severity_class": "Unknown", "priority": "MEDIUM", "severity_score": 0,
    })


def detect_duplicate(text1: str, text2: str, client, model_name: str) -> dict:
    """
    Two-stage duplicate detection (from india-ai-2026):
      Stage 1: TF-IDF cosine similarity — fast pre-filter
      Stage 2: Gemini semantic comparison — only if cosine > 0.2
      Blended score: 0.4 × cosine + 0.6 × LLM
    """
    cosine = cosine_similarity(text1, text2)
    if cosine < 0.2:
        return {
            "is_duplicate": False,
            "similarity_score": round(cosine, 3),
            "cosine_similarity": round(cosine, 3),
            "matching_elements": [],
            "differing_elements": [],
            "reasoning": "Cosine similarity below threshold — cases are clearly distinct.",
        }
    llm_result = call_gemini(
        client, model_name,
        DUPLICATE_PROMPT.format(text1=text1[:10000], text2=text2[:10000]),
        fallback={"is_duplicate": False, "similarity_score": 0.0},
    )
    llm_score = llm_result.get("similarity_score", 0.0)
    blended = 0.4 * cosine + 0.6 * llm_score
    llm_result["similarity_score"] = round(blended, 3)
    llm_result["cosine_similarity"] = round(cosine, 3)
    llm_result["is_duplicate"] = blended >= 0.80
    return llm_result


def classify_batch(reports: List[str], client, model_name: str) -> List[dict]:
    formatted = "\n\n---\n\n".join(f"[Report {i}]:\n{r[:3000]}" for i, r in enumerate(reports))
    return call_gemini(
        client, model_name,
        BATCH_PROMPT.format(reports=formatted[:25000]),
        fallback=[],
    )
