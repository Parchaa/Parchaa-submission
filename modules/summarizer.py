from utils.gemini_client import call_gemini

PROMPTS = {
    "SUGAM Application": """You are a senior CDSCO regulatory reviewer with expertise in the Indian drug approval process under the New Drugs and Clinical Trials (NDCT) Rules 2019, Schedule Y, and the Drugs & Cosmetics Act 1940.

Summarise the SUGAM regulatory submission below. SUGAM (Submission Gateway and Management System) submissions include new drug applications, clinical trial applications (CTA), import licences, manufacturing licences, and related filings.

=== WHAT TO EXTRACT ===
- application_type: e.g. "New Drug Application (NDA)", "Clinical Trial Application (Phase II)", "Import Licence Application", "Fixed Dose Combination Application"
- applicant: company/sponsor name and country of origin
- product: INN/brand name, dosage form, strength, route of administration
- key_claims: primary efficacy claims supported by evidence (be specific — name endpoints, comparators, effect sizes if present)
- clinical_data_summary: brief synthesis of Phase I/II/III data — patient numbers, key results, limitations
- safety_profile: notable adverse events, contraindications, black box warnings, post-marketing commitments if mentioned
- regulatory_status: current pathway — if it references approval in US/EU, list those; orphan drug status; fast track; new chemical entity vs. known molecule
- missing_information: specific gaps that would block approval — missing module, absent comparator data, incomplete safety database, no Indian bridging study where required
- reviewer_notes: regulatory concerns, data quality issues, or procedural flags a CDSCO reviewer should note
- recommendation: "Proceed" (submission adequate for review), "Request Additional Info" (specific gaps need filling before review), or "Flag for Review" (serious concern — data inconsistency, safety signal, or policy issue)

=== RULES ===
- Be specific: do not write generic statements like "clinical data provided". Name drugs, numbers, endpoints.
- missing_information should list actual missing elements, not generic advice.
- reviewer_notes should flag anything unusual: foreign data without bridging study, surrogate endpoints, expedited pathway claims, conflict with Indian labelling requirements.
- Return ONLY valid JSON, no markdown, no commentary.

Return JSON:
{{
  "application_type": "...",
  "applicant": "...",
  "product": "...",
  "key_claims": ["specific claim with supporting data point"],
  "clinical_data_summary": "2-3 sentences covering trial design, patient numbers, primary result",
  "safety_profile": "2-3 sentences on AE profile, serious events, monitoring requirements",
  "regulatory_status": "...",
  "missing_information": ["specific missing item 1", "specific missing item 2"],
  "reviewer_notes": "specific regulatory concerns for CDSCO reviewer",
  "recommendation": "Proceed"|"Request Additional Info"|"Flag for Review"
}}

Document:
\"\"\"{text}\"\"\"
""",

    "SAE Case Narration": """You are a pharmacovigilance specialist at CDSCO, trained in ICH E2A (Clinical Safety Data Management), E2B (data elements), the WHO-UMC causality scale, and MedDRA coding.

Analyse the SAE case narration below and produce a structured pharmacovigilance summary.

=== WHAT TO EXTRACT ===
- case_id: case reference number (MedWatch, CIOMS, sponsor reference, or CDSCO ICSRnumber)
- patient_profile: age, sex, weight if available; relevant medical history; concomitant medications
- suspect_drug: INN name, dose, route, indication, duration of treatment before event
- event: concise clinical description of the adverse event — onset, progression, severity grade if stated
- onset_date: date or time-to-onset after starting suspect drug
- outcome: "Recovered/Resolved" | "Recovering/Resolving" | "Not Recovered/Not Resolved" | "Recovered with Sequelae" | "Fatal" | "Unknown"
- causality: apply WHO-UMC causality categories — Certain / Probable-Likely / Possible / Unlikely / Conditional-Unclassified / Unassessable-Unclassifiable — and state the key reason
- seriousness_criteria: list ALL applicable ICH E2A criteria that make this event serious:
    - Results in death
    - Is life-threatening
    - Requires inpatient hospitalisation or prolongation of existing hospitalisation
    - Results in persistent or significant disability/incapacity
    - Is a congenital anomaly/birth defect
    - Is a medically important event (requires intervention to prevent one of the above)
- key_findings: lab values, imaging, or clinical findings that are diagnostically significant
- resolution_status: treatment given for the AE and its result; dechallenge/rechallenge information if available
- action_required: regulatory action needed — e.g. "Expedited 15-day report to CDSCO", "Aggregate reporting in PSUR", "Label update recommended", "Signal requires further investigation", "No action required"
- case_summary: 3-4 sentence plain-language narrative suitable for a regulatory submission cover letter

=== RULES ===
- Do NOT invent data. If a field is not determinable from the text, use null.
- causality must name the specific WHO-UMC category and one-line reasoning.
- action_required must be specific — name the applicable reporting timeline (7-day/15-day) and the destination (CDSCO, Ethics Committee, Sponsor) if determinable.
- Return ONLY valid JSON, no markdown, no commentary.

Return JSON:
{{
  "case_id": "...",
  "patient_profile": "...",
  "suspect_drug": "...",
  "event": "...",
  "onset_date": "...",
  "outcome": "...",
  "causality": "WHO-UMC category — reason",
  "seriousness_criteria": ["criterion 1", "criterion 2"],
  "key_findings": ["finding 1", "finding 2"],
  "resolution_status": "...",
  "action_required": "...",
  "case_summary": "..."
}}

Document:
\"\"\"{text}\"\"\"
""",

    "Meeting Transcript / Audio Summary": """You are a regulatory affairs specialist summarising a CDSCO regulatory meeting for the official record.

CDSCO meeting types include: Drug Technical Advisory Board (DTAB), Subject Expert Committee (SEC), New Drug Advisory Committee (NDAC), Pre-submission meetings, Ethics Committee meetings, and inter-departmental reviews.

Produce a formal meeting summary from the transcript below.

=== WHAT TO EXTRACT ===
- meeting_date: date and time if available
- attendees: names and designations/organisations; separate CDSCO officials from external participants
- agenda_items: each agenda item as a short phrase
- key_decisions: decisions that have regulatory force or directly commit any party to an action — be specific (e.g. "Phase III trial conditionally approved subject to revised protocol submission within 30 days", not "trial discussed")
- action_items: each action as {{owner, action, deadline}} — owner is the specific person/org responsible; action is the precise deliverable; deadline is exact date or "TBD"
- next_steps: follow-up tasks that do not have a named owner but need tracking
- unresolved_issues: questions raised but not resolved in the meeting — include why they remain open if stated
- executive_summary: 3-5 sentence synthesis of what was decided and what the regulatory implications are; note if any decision departs from standard process

=== RULES ===
- key_decisions must be specific and actionable — avoid vague phrases like "discussed" or "noted".
- Distinguish between decisions (binding), action items (assigned tasks), and next steps (unassigned follow-ups).
- If a regulatory timeline is mentioned (e.g. CDSCO approval timeline, submission window), include it explicitly.
- Return ONLY valid JSON, no markdown, no commentary.

Return JSON:
{{
  "meeting_date": "...",
  "attendees": ["Name — Designation, Organisation"],
  "agenda_items": ["item 1", "item 2"],
  "key_decisions": ["specific decision with any conditions attached"],
  "action_items": [{{"owner": "Name/Org", "action": "specific deliverable", "deadline": "date or TBD"}}],
  "next_steps": ["follow-up item"],
  "unresolved_issues": ["issue — reason it remains open"],
  "executive_summary": "..."
}}

Document:
\"\"\"{text}\"\"\"
""",
}


def summarise_document(text: str, doc_type: str, client, model_name: str) -> dict:
    prompt = PROMPTS.get(doc_type, PROMPTS["SUGAM Application"]).format(text=text[:150000])
    return call_gemini(client, model_name, prompt, fallback={"error": "Summary failed"})
