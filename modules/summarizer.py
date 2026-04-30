from utils.gemini_client import call_gemini

PROMPTS = {
    "SUGAM Application": """Summarise this CDSCO regulatory application. Return JSON:
{{
  "application_type": "...", "applicant": "...", "product": "...",
  "key_claims": ["..."],
  "clinical_data_summary": "...",
  "safety_profile": "...",
  "regulatory_status": "...",
  "missing_information": ["..."],
  "reviewer_notes": "...",
  "recommendation": "Proceed"|"Request Additional Info"|"Flag for Review"
}}
Document:\"\"\"{text}\"\"\"
""",
    "SAE Case Narration": """Analyse this SAE report for CDSCO pharmacovigilance. Return JSON:
{{
  "case_id": "...", "patient_profile": "...", "suspect_drug": "...",
  "event": "...", "onset_date": "...", "outcome": "...",
  "causality": "...", "seriousness_criteria": ["..."],
  "key_findings": ["..."], "resolution_status": "...",
  "action_required": "...", "case_summary": "..."
}}
Document:\"\"\"{text}\"\"\"
""",
    "Meeting Transcript / Audio Summary": """Summarise this regulatory meeting transcript. Return JSON:
{{
  "meeting_date": "...", "attendees": ["..."], "agenda_items": ["..."],
  "key_decisions": ["..."],
  "action_items": [{{"owner":"...","action":"...","deadline":"..."}}],
  "next_steps": ["..."], "unresolved_issues": ["..."],
  "executive_summary": "..."
}}
Document:\"\"\"{text}\"\"\"
""",
}


def summarise_document(text: str, doc_type: str, client, model_name: str) -> dict:
    prompt = PROMPTS.get(doc_type, PROMPTS["SUGAM Application"]).format(text=text[:28000])
    return call_gemini(client, model_name, prompt, fallback={"error": "Summary failed"})
