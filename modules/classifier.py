"""SAE classification + duplicate detection with TF-IDF cosine pre-filter."""
from typing import List
from utils.gemini_client import call_gemini
from utils.pii_rules import cosine_similarity

CLASSIFY_PROMPT = """You are a pharmacovigilance specialist at CDSCO, trained in ICH E2A seriousness criteria, MedDRA coding, and the WHO-UMC causality scale.

Classify the SAE/case report below.

=== SEVERITY CLASS — ICH E2A DEFINITIONS ===
Choose the MOST SERIOUS applicable category:
  Death                               — patient died and the event is the likely cause
  Life-Threatening                    — patient was at immediate risk of death at time of event (not hypothetically)
  Hospitalisation Required            — required inpatient admission or prolonged existing admission
  Persistent Disability/Incapacity    — substantial disruption to normal life functions, ongoing
  Congenital Anomaly/Birth Defect     — in offspring of a patient exposed to the drug
  Medically Important Event           — may not meet above criteria but required medical/surgical intervention to prevent one of them (e.g. bronchospasm, drug dependence, liver enzyme elevation requiring monitoring)
  Other Non-Serious                   — none of the above apply

=== SEVERITY SCORE 1–10 ===
1–3 Mild/non-serious | 4–6 Moderate/serious | 7–8 Severe/life-threatening | 9–10 Fatal or near-fatal

=== PRIORITY ===
  URGENT — Death, Life-Threatening, or any critical safety signal; 7-day expedited reporting likely required
  HIGH   — Hospitalisation Required with significant morbidity; 15-day expedited reporting likely required
  MEDIUM — Persistent disability, congenital anomaly, medically important event
  LOW    — Other non-serious, minor, recovering rapidly

=== CAUSALITY — WHO-UMC SCALE ===
  Certain          — temporal relationship ideal; plausible mechanism; no alternative explanation; positive dechallenge; positive rechallenge
  Probable/Likely  — reasonable temporal relationship; unlikely due to disease or other drugs; positive dechallenge; no rechallenge
  Possible         — reasonable temporal relationship; but disease or other drugs could equally explain
  Unlikely         — temporal relationship implausible; other explanation more likely
  Conditional      — event requires more data; cannot be properly assessed
  Unassessable     — impossible to assess due to insufficient information

=== MedDRA ===
event_pt: the most specific applicable MedDRA Preferred Term. If unsure, use the best clinical match (e.g. "Pericardial effusion", "Acute kidney injury", "Anaphylactic reaction").

=== DUPLICATE RISK ===
  High   — case ID, patient demographics, drug, and event date all match what might be a previous case; re-submission likely
  Medium — some matching identifiers but different reporter or source
  Low    — no obvious matching indicators

=== FLAGS ===
Include only those that apply: "Paediatric case" (< 18 yrs), "Elderly patient" (≥ 65 yrs), "Pregnancy/Lactation", "Off-label use", "Medication error", "Overdose", "Drug interaction", "Signal of interest — requires medical review", "Delayed onset (> 30 days after last dose)"

Return ONLY valid JSON, no markdown, no commentary:
{{
  "case_id": "extracted case ID or generate one in format CASE-YYYY-NNNN",
  "severity_class": "...",
  "severity_score": integer 1-10,
  "priority": "URGENT"|"HIGH"|"MEDIUM"|"LOW",
  "seriousness_criteria": ["applicable ICH E2A criterion as written above"],
  "causality_assessment": "WHO-UMC category",
  "drug_suspect": "INN name, dose, route",
  "event_pt": "MedDRA Preferred Term",
  "outcome": "Recovered/Resolved"|"Recovering/Resolving"|"Not Recovered/Not Resolved"|"Recovered with Sequelae"|"Fatal"|"Unknown",
  "duplicate_risk": "High"|"Medium"|"Low",
  "duplicate_indicators": ["specific field that suggests a possible duplicate"],
  "flags": ["applicable flags only"],
  "reviewer_priority_notes": "2-sentence note: first sentence states the key clinical concern; second sentence states the recommended regulatory action (e.g. 15-day report, signal assessment, label review)"
}}

Case:
\"\"\"{text}\"\"\"
"""

DUPLICATE_PROMPT = """You are a pharmacovigilance specialist reviewing two SAE reports to determine if they describe the same adverse event.

In pharmacovigilance, "duplicate" means both reports refer to the same underlying event in the same patient, regardless of:
  - different submission dates or report types (initial vs follow-up vs summary)
  - different levels of detail or language (lay vs medical)
  - different reporters (patient, doctor, sponsor)
  - whether one report explicitly references the other as a follow-up

Key matching signals: same patient identifiers, same suspect drug, same event onset date, same event type, same site/sponsor/reference number.
If Case B is a follow-up, amendment, or supplementary report to Case A describing the same event — that IS a duplicate.

Return JSON only:
{{
  "is_duplicate": true|false,
  "similarity_score": float 0.0-1.0 representing how likely these are the same event,
  "matching_elements": [list of matching fields/identifiers],
  "differing_elements": [list of fields that differ],
  "reasoning": "2-3 sentence explanation of your determination"
}}

Case 1: \"\"\"{text1}\"\"\"
Case 2: \"\"\"{text2}\"\"\"
"""

BATCH_PROMPT = """You are a pharmacovigilance specialist. Classify each SAE report below using ICH E2A criteria.

For each report return one JSON object in an array:
{{
  "index": 0-based integer,
  "case_id": "extracted case/reference ID or generate one",
  "severity_class": one of ["Death","Life-Threatening","Hospitalisation Required","Persistent Disability/Incapacity","Congenital Anomaly/Birth Defect","Medically Important Event","Other Non-Serious"],
  "severity_score": integer 1-10,
  "priority": "URGENT"|"HIGH"|"MEDIUM"|"LOW",
  "seriousness_criteria": [applicable ICH E2A criteria as short strings],
  "causality_assessment": "Certain"|"Probable/Likely"|"Possible"|"Unlikely"|"Unassessable",
  "drug_suspect": "primary suspect drug name and dose if available",
  "event_pt": "MedDRA Preferred Term for the primary adverse event",
  "outcome": "Recovered/Resolved"|"Recovering"|"Not Recovered"|"Fatal"|"Unknown",
  "flags": [special flags: "Paediatric","Pregnancy","Off-label use","Medication error","Signal of interest" — include only those that apply],
  "potential_duplicate_of": [0-based indices of other reports that may be duplicates],
  "duplicate_confidence": "High"|"Medium"|"Low"|"None"
}}

Return ONLY a valid JSON array, no commentary, no markdown fences.

Reports:
{reports}
"""


def classify_single(text: str, client, model_name: str) -> dict:
    return call_gemini(client, model_name, CLASSIFY_PROMPT.format(text=text[:150000]), fallback={
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
    llm_is_dup = llm_result.get("is_duplicate", False)
    # Flag as duplicate if: blended score ≥ 0.80 OR (LLM explicitly says duplicate AND blended ≥ 0.70)
    # The second condition handles follow-up/supplementary reports that share all identifiers but
    # differ in submission date/format, which the LLM catches but the blended score may miss by a margin.
    is_duplicate = blended >= 0.80 or (llm_is_dup and blended >= 0.70)
    llm_result["similarity_score"] = round(blended, 3)
    llm_result["cosine_similarity"] = round(cosine, 3)
    llm_result["is_duplicate"] = is_duplicate
    return llm_result


def classify_batch(reports: List[str], client, model_name: str) -> List[dict]:
    formatted = "\n\n---\n\n".join(f"[Report {i}]:\n{r[:3000]}" for i, r in enumerate(reports))
    return call_gemini(
        client, model_name,
        BATCH_PROMPT.format(reports=formatted[:25000]),
        fallback=[],
    )
