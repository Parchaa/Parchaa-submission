from utils.gemini_client import call_gemini

# Sub-type specific regulatory context injected into the SUGAM prompt.
# Each entry provides the exact checklist framework, mandatory documents,
# and flag criteria specific to that SUGAM application pathway.
_SUGAM_SUBTYPE_CONTEXT = {
    "New Drug Application": """
Sub-Type: New Drug Application (NDA / New Molecular Entity)
Framework: NDCT Rules 2019 Rule 101, Schedule Y, Drugs & Cosmetics Act 1940 Section 21.
Mandatory CTD modules: Module 1 (Administrative), Module 2 (Summaries), Module 3 (Quality/Chemistry),
  Module 4 (Non-clinical Safety/Pharmacology/Toxicology), Module 5 (Clinical Efficacy & Safety).
Key requirements:
  - Indian bridging study required if primary trial population is non-Indian (unless SRA-approved
    with adequate representation or waiver granted under NDCT Rule 101(1)(i))
  - Free Sale Certificate (FSC) or Certificate of Pharmaceutical Product (CoPP) from country of origin
  - GMP certificate for each manufacturing site (WHO/PIC/S format)
  - Expedited review track requires prior approval in at least one SRA country
    (US FDA, EMA, TGA, Health Canada, PMDA Japan, MHRA)
  - Proposed prescribing information (PI/package insert) must comply with Indian labelling rules
  - Pharmacovigilance Plan and Risk Management Plan (RMP)
  - Paediatric Investigation Plan (or waiver justification) if product has paediatric use
Flag specifically: Absent CTD modules, missing Indian bridging data, surrogate endpoints without
  regulatory qualification, SRA approval claimed but not evidenced, GMP certificate expired.
""",
    "Clinical Trial Application": """
Sub-Type: Clinical Trial Application (CTA)
Framework: NDCT Rules 2019 Rules 41-58, Schedule Y Parts I-IV, ICH E6(R2) GCP, ICMR GCP Guidelines 2017.
Key documents to verify:
  - Form CT-04 (CDSCO application form)
  - Clinical Protocol (final version + all amendments numbered separately)
  - Investigator's Brochure (IB) — version date must post-date the protocol date
  - Informed Consent Form (ICF) and Patient Information Sheet (PIS) — must be in English AND
    relevant regional language(s) for each site
  - Ethics Committee approval letter from CDSCO-registered EC (Sec 11, NDCT Rules)
  - Site details: full address, facility capabilities, PI/Sub-investigator CVs, GCP training certificates
  - Insurance / Indemnity policy covering trial-related injury per Schedule Y
  - Phase-appropriate preclinical/clinical data:
      Phase I → complete toxicology package, first-in-human data if available
      Phase II → Phase I summary; safety data package
      Phase III → Phase I + II data; statistical analysis plan (SAP); DSMB/DSMC charter
  - Clinical Trial Registry — India (CTRI) registration number (or acknowledgement for prospective registration)
  - Import Licence for Investigational Product (if manufactured outside India)
Flag specifically: EC approval from unregistered EC, IB predates the protocol, ICF not in local language,
  no DSMC charter for Phase III, CTRI registration absent, insurance coverage inadequate.
""",
    "Import Licence Application": """
Sub-Type: Import Licence Application (Form 10 / Form 10B)
Framework: Drugs & Cosmetics Act Section 12, D&C Rules 24-34, NDCT Rules 2019 (for new drugs).
Key requirements:
  - Free Sale Certificate (FSC) or Certificate of Pharmaceutical Product (CoPP)
    from competent authority of exporting country — check expiry date
  - GMP certificate for manufacturing site (WHO or PIC/S format) — check validity
  - Proof of approval/registration in country of origin (product must be marketed there)
  - For New Drug imports: full NDA-equivalent dossier + Indian bridging study if required
  - For already-approved molecules: abbreviated dossier permissible; reference SRA approval
  - Indian labelling compliance: English language, import licence number on label,
    CDSCO-mandated schedule warnings, no promotional claims not approved in India
  - Bioequivalence data for generic imports (per Schedule Y Appendix I)
  - Cold chain/storage declaration for temperature-sensitive products
Flag specifically: CoPP expired or issued by non-recognized authority, GMP certificate invalid,
  product not marketed in country of origin, generic import without BE data, labelling not India-compliant,
  missing import licence application fee receipt.
""",
    "Fixed Dose Combination": """
Sub-Type: Fixed Dose Combination (FDC) Application
Framework: NDCT Rules 2019 Rule 99, CDSCO FDC Policy (2016), Schedule Y.
Mandatory FDC-specific elements:
  - Clinical / pharmacological rationale: why combine vs. sequential/separate administration —
    must cite published evidence or provide original data
  - Pharmacokinetic interaction study: the combination must not adversely alter individual component PK
    (AUC, Cmax, Tmax) — in vitro data acceptable only if PK interaction is scientifically improbable
  - Each individual component must be separately approved in India OR have sufficient independent
    safety + efficacy data included in the dossier
  - Dose ratio justification: clinical basis for the specific dose ratio chosen
  - Combination-specific safety data: AEs attributable to the combination (not just individual components)
  - Stability data for the combined formulation (ICH Q1A conditions; 6 months accelerated minimum)
  - Proposed labelling: indications must be limited to those supported by FDC data
  - Formulation QC data: dissolution, content uniformity, assay for each active
Flag specifically: No PK interaction data, dose ratio not justified, individual components not
  separately approved without independent data, irrational combination (therapeutic duplication,
  no added benefit), labelling claims exceed evidence, unstable combination (shelf-life < 12 months).
""",
    "PSUR / DSUR": """
Sub-Type: Periodic Safety Update Report (PSUR) / Development Safety Update Report (DSUR)
Framework: ICH E2C(R2) PBRER format, CDSCO PvPI guidelines, Schedule Y adverse event reporting.
Key sections to verify (PBRER format):
  - Section 1: Introduction — product details, data lock point (DLP), reporting period stated
  - Section 2: Worldwide Market Authorisation Status — all countries where approved/withdrawn
  - Section 3: Actions Taken for Safety Reasons during reporting period (label changes, withdrawals)
  - Section 4: Changes to Reference Safety Information (RSI/IB updates since last PSUR)
  - Section 5: Cumulative Exposure — patient-years or patient-exposures estimated
  - Section 6-7: SAE summary tabulations from clinical trials and post-marketing
  - Section 8-9: Cumulative spontaneous ADR summary; relevant safety publications
  - Section 14: Signal Detection and Evaluation — new signals, signals closed, ongoing signals
  - Section 15: Benefit-Risk Evaluation — must include an explicit conclusion statement
  - Section 16: Summary of Important Risks (aligned with current RMP)
  - Appendix: line listings of serious unexpected AEs from clinical trials
Flag specifically: Missing benefit-risk conclusion, absence of signal assessment section,
  DLP not stated, cumulative exposure figures absent, no comparison to prior PSUR period,
  new safety signals not evaluated, reference safety information not updated.
""",
}

PROMPTS = {
    "SUGAM Application": """You are a senior CDSCO regulatory reviewer with expertise in the Indian drug approval process under the New Drugs and Clinical Trials (NDCT) Rules 2019, Schedule Y, and the Drugs & Cosmetics Act 1940.

Summarise the SUGAM regulatory submission below.{subtype_context}

=== WHAT TO EXTRACT ===
- application_type: e.g. "New Drug Application (NDA)", "Clinical Trial Application (Phase II)", "Import Licence Application", "Fixed Dose Combination Application"
- sub_type: the specific SUGAM sub-type if determinable from the document
- applicant: company/sponsor name and country of origin
- product: INN/brand name, dosage form, strength, route of administration
- key_claims: primary efficacy claims supported by evidence (be specific — name endpoints, comparators, effect sizes if present)
- clinical_data_summary: brief synthesis of Phase I/II/III data — patient numbers, key results, limitations
- safety_profile: notable adverse events, contraindications, black box warnings, post-marketing commitments if mentioned
- regulatory_status: current pathway — if it references approval in US/EU, list those; orphan drug status; fast track; new chemical entity vs. known molecule
- checklist_status: for each mandatory document/module relevant to this sub-type, state "Present", "Absent", or "Partial" with a note
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
  "sub_type": "...",
  "applicant": "...",
  "product": "...",
  "key_claims": ["specific claim with supporting data point"],
  "clinical_data_summary": "2-3 sentences covering trial design, patient numbers, primary result",
  "safety_profile": "2-3 sentences on AE profile, serious events, monitoring requirements",
  "regulatory_status": "...",
  "checklist_status": [{{"item": "document/module name", "status": "Present|Absent|Partial", "note": "brief note"}}],
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
- case_id: case reference number (MedWatch, CIOMS, sponsor reference, or CDSCO ICSR number)
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
- reporting_timeline: based on seriousness and expectedness — "7-day expedited to CDSCO + EC" (unexpected fatal/life-threatening), "15-day expedited to CDSCO + EC" (all other unexpected serious), "Annual DSUR/PSUR" (expected serious), or "Not reportable" — state the reason
- action_required: regulatory action needed beyond the reporting timeline — e.g. "Label update recommended", "Signal requires further investigation", "No further action"
- case_summary: 3-4 sentence plain-language narrative suitable for a regulatory submission cover letter

=== RULES ===
- Do NOT invent data. If a field is not determinable from the text, use null.
- causality must name the specific WHO-UMC category and one-line reasoning.
- reporting_timeline must distinguish 7-day vs 15-day and name both destinations (CDSCO + EC/Sponsor).
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
  "reporting_timeline": "...",
  "action_required": "...",
  "case_summary": "..."
}}

Document:
\"\"\"{text}\"\"\"
""",

    "Meeting Transcript / Audio Summary": """You are a regulatory affairs specialist summarising a CDSCO regulatory meeting for the official record.

CDSCO meeting types include: Drug Technical Advisory Board (DTAB), Subject Expert Committee (SEC),
New Drug Advisory Committee (NDAC), Pre-submission meetings, Ethics Committee meetings,
and inter-departmental reviews.

Produce a formal meeting summary from the transcript below.

=== WHAT TO EXTRACT ===
- meeting_type: identify the body type if determinable (DTAB / SEC / NDAC / Pre-submission / EC / Inter-departmental / Unknown)
- meeting_date: date and time if available
- attendees: names and designations/organisations; separate CDSCO officials from external participants
- agenda_items: each agenda item as a short phrase
- key_decisions: decisions that have regulatory force or directly commit any party to an action — be specific (e.g. "Phase III trial conditionally approved subject to revised protocol submission within 30 days", not "trial discussed")
- action_items: each action as {{owner, action, deadline}} — owner is the specific person/org responsible; action is the precise deliverable; deadline is exact date or "TBD"
- next_steps: follow-up tasks that do not have a named owner but need tracking
- unresolved_issues: questions raised but not resolved in the meeting — include why they remain open if stated
- regulatory_timelines: any specific CDSCO/regulatory deadlines mentioned (submission windows, review timelines, response deadlines)
- executive_summary: 3-5 sentence synthesis of what was decided and what the regulatory implications are; note if any decision departs from standard process

=== RULES ===
- key_decisions must be specific and actionable — avoid vague phrases like "discussed" or "noted".
- Distinguish between decisions (binding), action items (assigned tasks), and next steps (unassigned follow-ups).
- If a regulatory timeline is mentioned, include it explicitly in regulatory_timelines.
- Return ONLY valid JSON, no markdown, no commentary.

Return JSON:
{{
  "meeting_type": "...",
  "meeting_date": "...",
  "attendees": ["Name — Designation, Organisation"],
  "agenda_items": ["item 1", "item 2"],
  "key_decisions": ["specific decision with any conditions attached"],
  "action_items": [{{"owner": "Name/Org", "action": "specific deliverable", "deadline": "date or TBD"}}],
  "next_steps": ["follow-up item"],
  "unresolved_issues": ["issue — reason it remains open"],
  "regulatory_timelines": ["timeline item"],
  "executive_summary": "..."
}}

Document:
\"\"\"{text}\"\"\"
""",
}


def summarise_document(text: str, doc_type: str, client, model_name: str, sub_type: str = "") -> dict:
    prompt_template = PROMPTS.get(doc_type, PROMPTS["SUGAM Application"])

    subtype_context = ""
    if doc_type == "SUGAM Application" and sub_type and sub_type in _SUGAM_SUBTYPE_CONTEXT:
        subtype_context = "\n\n=== APPLICATION SUB-TYPE CONTEXT ===\n" + _SUGAM_SUBTYPE_CONTEXT[sub_type].strip()

    prompt = prompt_template.format(text=text[:150000], subtype_context=subtype_context)
    return call_gemini(client, model_name, prompt, fallback={"error": "Summary failed"})

def chat_with_document(text: str, question: str, client, model_name: str) -> dict:
    prompt = f"""You are a helpful regulatory AI assistant. A user is asking a question about a document. 
Answer the question concisely but completely based ONLY on the provided document text. 
If the answer is not in the text, say "I cannot find the answer to this in the document."

Return JSON:
{{
  "answer": "your detailed answer here"
}}

Question: {question}

Document:
\"\"\"{text[:150000]}\"\"\"
"""
    return call_gemini(client, model_name, prompt, fallback={"answer": "Sorry, I could not generate an answer at this time."})
