# CDSCO RegAI — Full Technical Documentation

**India-AI Health Innovation Hackathon 2026**
**Team / Submitter:** sneha@nyaayai.com
**Live URL:** https://cdsco.parchaa.com
**API Docs:** https://cdsco.parchaa.com/api/docs

---

## Table of Contents

1. [Solution Overview](#1-solution-overview)
2. [Project Report](#2-project-report)
   - [Detection Methodology](#a-detection-methodology)
   - [Anonymisation Strategy](#b-anonymisation-strategy)
   - [Flagging Mechanism](#c-flagging-mechanism)
   - [Classification Criteria](#d-classification-criteria)
   - [Source Material Handling](#e-source-material-handling)
   - [Model Evaluation](#f-model-evaluation)
   - [Implementation Plan](#g-implementation-plan)
3. [System Architecture](#3-system-architecture)
4. [Demo Guide](#4-demo-guide-5-minutes)
5. [Speaking Points for Demo](#5-speaking-points-for-demo)

---

## 1. Solution Overview

CDSCO RegAI is a full-stack, AI-driven regulatory workflow automation platform built to reduce manual effort for CDSCO drug reviewers and pharmacovigilance officers. It addresses six high-friction tasks in the Indian drug regulatory lifecycle:

| Module | Problem Solved |
|--------|---------------|
| PII/PHI Anonymisation | Patient records contain sensitive identifiers; sharing for review without redaction violates the DPDP Act 2023 |
| Document Summarisation | SAE narrations, SUGAM applications, and meeting transcripts are dense; officers spend hours extracting key facts |
| Completeness Assessment | CT/NDA applications routinely miss mandatory sections; manual checklist verification is slow and error-prone |
| Document Comparison | Protocol amendments require identifying substantive changes across versions; line-by-line diff misses semantic intent |
| SAE Classification | Manual severity grading per ICH E2A is slow; duplicate ICSRs distort pharmacovigilance safety signals |
| Inspection Report Generation | Converting raw GMP/GCP/GDP field notes into structured CDSCO-format reports takes hours |

The platform accepts PDF, DOCX, and TXT documents and returns structured, actionable output within seconds — all without requiring a custom-trained model. It uses a large language model (LLM) via API, with domain-specific prompting that embeds CDSCO and ICH regulatory standards directly into the instructions.

---

## 2. Project Report

### A. Detection Methodology

#### PII/PHI Anonymisation — Three-Layer Hybrid Pipeline

The anonymisation engine uses a sequential three-layer architecture. Each layer is designed to catch what the previous layer cannot, moving from deterministic pattern matching to statistical NER to contextual AI reasoning.

**Layer 1 — Deterministic Regex (`pii_rules.py`)**

Regex patterns are applied first because they are fast, zero-latency, and zero-false-negative for structured Indian PII formats.

| Entity Type | Pattern Logic |
|-------------|--------------|
| Aadhaar Number | 12-digit number (first digit 2–9), optional spaces or dashes; negative lookbehind for `+` to exclude international phone prefixes |
| PAN Number | Exact format: 5 uppercase letters + 4 digits + 1 uppercase letter |
| Passport Number | Indian format: letter prefix (A–PR–WY) followed by 7 alphanumeric characters |
| Email Address | Standard RFC-5321 compliant pattern |
| Date of Birth | DD/MM/YYYY and DD-MM-YYYY variants, years 1900–2099 |
| Patient / Encounter ID | Labeled form (`Patient ID: CH25016452`) and prefix form (`OPCH813254`, `MRN-1234`) |
| Indian Pincode | 6-digit number, first digit 1–9 |
| Bank Account Number | 11–18 digit numbers with negative lookbehind to exclude phone-like patterns |

Phone number detection uses a **3-gate pipeline** to minimise false positives on Indian mobile numbers:
- **Gate 1 — Pattern match:** 10-digit number starting with 6–9
- **Gate 2 — Context window:** keyword within 40 characters before the match (phone, mobile, contact, tel, whatsapp, helpline)
- **Gate 3 — False-positive filter:** reject if preceded by document-reference keywords (article, section, clause, schedule)

**Layer 2 — Presidio + spaCy NER (`presidio_engine.py`)**

Microsoft Presidio with the `en_core_web_lg` spaCy model performs Named Entity Recognition for entities that regex cannot detect. Six custom recognisers extend Presidio's default set to handle Indian clinical document specifics:

| Custom Recogniser | Entities Detected |
|-------------------|------------------|
| AadhaarRecognizer | `IN_AADHAAR` with context-boosted confidence scoring |
| PANRecognizer | `IN_PAN` |
| PassportRecognizer | `IN_PASSPORT` with travel-document context boosting |
| MedicalRecordRecognizer | `MEDICAL_RECORD` — labeled IDs, MRN formats, OPCH/CH prefixes |
| PhoneINRecognizer | `IN_PHONE` — Indian mobile with +91 prefix variants |
| AllCapsPersonRecognizer | `PERSON` — consultant and doctor names written in ALL CAPS, commonly missed by standard NER in Indian hospital records |
| DiagnosisRecognizer | `PHI_DIAGNOSIS` — diagnosis mentions triggered by contextual phrases |

A **geographic allowlist** prevents over-redaction of non-identifying public geography: country names (India) and all 28 Indian states/8 Union Territories are preserved. Street addresses, localities, and city names remain redacted because they can identify individuals when combined with other fields.

**Layer 3 — LLM Contextual Analysis (`anonymizer.py`)**

After Layers 1 and 2, the partially anonymised text is passed to a large language model with a domain-specific prompt. The model is instructed to identify only PHI that requires contextual medical understanding — the class of identifiers that neither regex nor NER can catch:

- Implicit diagnoses ("her insulin-dependent condition")
- Lab values that reveal a condition (CK 12,400 U/L as a rhabdomyolysis marker)
- Relationship identifiers that enable re-identification ("husband, a cardiologist at AIIMS")
- Combinations of quasi-identifiers that individually appear benign

The model returns a JSON array of `{category, value, replacement}` objects. Each matched value is replaced with a bracketed contextual generalisation (e.g., `[Ejection Fraction percentage]`).

#### Completeness Assessment — Checklist Verification Logic

The completeness module prompts the LLM with a document-type-specific checklist (Clinical Trial Application, New Drug Application, or SAE Report) and instructs it to verify each mandatory item with one of four status values:

- **Present** — item clearly found in the document
- **Partial** — item referenced but incomplete or ambiguous
- **Missing** — mandatory item not found
- **Not Applicable** — explicitly excluded or out of scope for this submission

The model returns a structured JSON response with `overall_completeness_pct` (0–100), per-item status with notes, `critical_missing` items that block approval, and `recommendations`. Prompts embed the specific CDSCO/ICH requirement text for each checklist item, so the model validates against a documented standard rather than performing keyword matching.

#### Document Comparison — Semantic Change Detection

The comparison module sends both document versions to the LLM with a prompt that instructs it to identify **substantive changes**, not formatting differences. Each detected change is classified by:

- **Type:** Amendment, Addition, Deletion, Clarification
- **Impact:** High / Medium / Low
- **Section:** which protocol section or form field changed
- **Regulatory significance:** whether the change requires a formal regulatory notification or protocol amendment filing

This is semantic comparison, not a textual diff. The model identifies that "300 patients" changed to "450 patients" constitutes a Major amendment requiring protocol amendment filing, even when the surrounding sentences are entirely different. A unified line-level diff is also computed (Python `difflib`) as a supplementary reference.

---

### B. Anonymisation Strategy

The anonymisation strategy balances strict patient privacy with the requirement for data utility during regulatory review. The platform implements a two-step framework.

#### Step 1 — Pseudonymisation (Reversible)

Every matched entity is replaced with a numbered token in the format `[ENTITY_TYPE_NNN]`. Tokens are sequential within a document run and maintain referential consistency — if the same name appears multiple times, it maps to the same token throughout.

```
Original:  Patient Ramesh Kumar, Aadhaar 2345-6789-0123, Phone 9876543210
Step 1:    Patient [PERSON_001], Aadhaar [AADHAAR_NUMBER_001], Phone [PHONE_NUMBER_001]
```

Each original value is encrypted using **Fernet AES-128-CBC** symmetric encryption (`cryptography.fernet`) before storage. The ciphertext is stored in the PostgreSQL `token_registry` table alongside the token string. A unique encryption key (stored as `TOKEN_ENCRYPTION_KEY` in `.env`) is required to reverse any token.

Authorised personnel can reverse any token via:
```
GET /api/anonymize/reverse/[PERSON_001]
→ { "original": "Ramesh Kumar", "warning": "This endpoint exposes PII. Every access must be logged and audited." }
```

#### Step 2 — Irreversible Generalisation

When **Full Anonymisation** mode is selected, an additional generalisation pass is applied to residual quasi-identifiers:

| Input | Output | Rule |
|-------|--------|------|
| `45 years old` | `40–49 years` | Age → decade bracket |
| `58M` / `45/F` | `50–59M` / `40–49F` | Clinical shorthand age → bracket |
| `12/03/2024` | `Q1-2024` | Date → quarter-year |
| `500032` | `500XXX` | Pincode → district prefix only |

This eliminates residual re-identification risk and ensures compliance with DPDP Act 2023 data minimisation requirements for external data sharing.

#### Sample Output

**Raw input (excerpt):**
```
Patient Name: Mr Suresh Balakrishnan Iyer
Patient ID: PSI-CV-IN008-0047
Age/Gender: 58M
Aadhaar: 2345 6789 0123
Phone: 9876543210
Admitted: 21/03/2024
Diagnosis: Statin-induced Rhabdomyolysis with AKI
```

**After Pseudonymisation:**
```
Patient Name: [PERSON_001]
Patient ID: [MEDICAL_RECORD_001]
Age/Gender: 58M
Aadhaar: [AADHAAR_NUMBER_001]
Phone: [PHONE_NUMBER_001]
Admitted: [DATE_OF_BIRTH_001]
Diagnosis: [PHI_DIAGNOSIS_001]
```

**After Full Anonymisation:**
```
Patient Name: [PERSON_001]
Patient ID: [MEDICAL_RECORD_001]
Age/Gender: 50–59M
Aadhaar: [AADHAAR_NUMBER_001]
Phone: [PHONE_NUMBER_001]
Admitted: Q1-2024
Diagnosis: [PHI_DIAGNOSIS_001]
```

**Token registry (stored encrypted in PostgreSQL):**

| Token | Category | Encrypted Original |
|-------|----------|--------------------|
| [PERSON_001] | PERSON | `gAAAAABh...` (Fernet AES-128) |
| [AADHAAR_NUMBER_001] | Aadhaar Number | `gAAAAABh...` |
| [PHONE_NUMBER_001] | Phone Number | `gAAAAABh...` |

---

### C. Flagging Mechanism

The flagging mechanism transforms the review process from manual document scanning into an intelligent, prioritised validation workflow.

#### Completeness Flagging

The LLM evaluates each checklist item against the submitted document and returns structured JSON:

```json
{
  "overall_completeness_pct": 62,
  "status": "Incomplete",
  "items": [
    { "item": "Statistical Analysis Plan (SAP)", "status": "Missing",  "notes": "No SAP document referenced or appended" },
    { "item": "Ethics Committee Approvals",       "status": "Partial", "notes": "Only 2 of 5 site ECs approved; PGI Chandigarh, JIPMER Puducherry pending" },
    { "item": "Informed Consent Forms",           "status": "Missing", "notes": "Regional language ICFs (Tamil, Telugu, Bengali) not submitted" }
  ],
  "critical_missing": [
    "Statistical Analysis Plan (SAP) — mandatory per Schedule Y",
    "Risk Management Plan (RMP) — required for new molecular entity"
  ],
  "reviewer_action": "Return to applicant — critical documents missing"
}
```

The `critical_missing` field surfaces blocking items in red in the dashboard. A reviewer sees in under 30 seconds what would have taken two hours of manual checklist review.

#### Duplicate Detection

Duplicate ICSR detection uses a two-stage blended scoring pipeline designed to balance speed and accuracy.

**Stage 1 — TF-IDF Cosine Pre-filter (fast, no LLM call):**

A TF-IDF vector is computed for each report using word frequency normalised by document length, excluding stop words. Cosine similarity is calculated:

```
cosine = dot(v1, v2) / (|v1| × |v2|)
```

If `cosine < 0.20`, the reports are definitively distinct and no LLM call is made (instant rejection).

**Stage 2 — LLM Semantic Comparison (for ambiguous cases, cosine ≥ 0.20):**

The LLM compares the reports for semantic similarity across case ID, suspect drug, event description, patient demographics, and timeline:

```
blended_score = 0.4 × cosine_similarity + 0.6 × ai_similarity
```

A `blended_score ≥ 0.80` flags the report as a potential duplicate. The model also returns `matching_elements` (which specific fields match) and `differing_elements`, so the reviewer can verify the decision rather than accept it blindly.

---

### D. Classification Criteria

SAE classification follows **ICH E2A** seriousness criteria exactly. The LLM is prompted with the formal ICH E2A definitions and must select from precisely these seven categories:

| ICH E2A Category | Definition Applied |
|------------------|--------------------|
| Death | Patient died as a direct result of the adverse event |
| Life-Threatening | Patient was at immediate risk of death at the time of the event |
| Hospitalisation Required | Inpatient hospitalisation or prolongation of existing hospitalisation |
| Persistent Disability/Incapacity | Substantial disruption of ability to conduct normal life functions |
| Congenital Anomaly/Birth Defect | Adverse effect in offspring of a patient who received the drug |
| Medically Important Event | Event that may jeopardise the patient or require intervention to prevent the above outcomes |
| Other Non-Serious | Does not meet any of the six seriousness criteria above |

The model additionally returns:
- **Causality:** WHO-UMC scale (Certain / Probable/Likely / Possible / Unlikely / Conditional / Unassessable)
- **Severity score:** 1–10 numeric scale
- **Suspect drug** and **MedDRA Preferred Term**
- **Priority:** URGENT / HIGH / MEDIUM / LOW — derived from the combination of severity class and causality
- **Reviewer priority notes:** a brief written justification for the assigned classification

Batch mode accepts multiple reports simultaneously and returns a ranked list ordered by priority, enabling pharmacovigilance officers to process the most critical cases first.

---

### E. Source Material Handling

The summarisation module uses three distinct prompt templates, each tuned to the structure and regulatory expectations of the document type.

#### SUGAM Drug Approval Applications

**Challenge:** Applications run 200–500 pages covering clinical data, safety summaries, regulatory status, and manufacturing details.

**Approach:** The prompt instructs the LLM to extract structured fields:
- Application type and applicant identity
- Product name, formulation, and therapeutic class
- Clinical data summary (phase, sample size, key endpoints)
- Safety profile and known risks
- Reviewer recommendation: Proceed / Request Additional Info / Flag for Review
- Missing information that would block approval

**Output:** Structured JSON rendered as labelled key-value cards in the UI, with the recommendation displayed as a colour-coded badge.

#### SAE Case Narrations (ICSRs)

**Challenge:** Individual Case Safety Reports follow CIOMS Form I structure but vary widely in completeness and use clinical shorthand that standard parsers cannot interpret.

**Approach:** The prompt maps the narrative to ICH E2A/E2B fields:
- Case ID, suspect drug, onset date, outcome, and resolution status
- Patient profile (age, weight, medical history, concomitant medications)
- Chronological event description
- Seriousness criteria met from the ICH E2A list
- Causality assessment with reasoning
- Action required (dechallenge, DSMB notification, label update)

**Output:** Case overview grid, summary paragraph, colour-coded seriousness criteria list, and action items.

#### Meeting Transcripts / Audio Summaries

**Challenge:** CDSCO Technical Expert Committee meetings run 3–6 hours; transcripts are unstructured dialogue with no formal schema.

**Approach:** The prompt identifies regulatory meeting structure and extracts:
- Meeting date and attendees
- Executive summary of outcomes
- Key decisions with attribution where possible
- Action items with owner, action description, and deadline
- Next meeting and follow-up steps
- Unresolved issues

**Output:** Meeting header, executive summary, structured action items table, decisions list, and next steps.

---

### F. Model Evaluation

#### Performance Observations

All evaluation is qualitative — the system has not been tested against a labelled gold-standard corpus. The following observations are based on testing with representative regulatory documents.

| Module | Observed Behaviour | Limitation |
|--------|-------------------|-----------:|
| Anonymisation Layer 1 | 100% recall on structured Indian PII (Aadhaar, PAN, phone, email, pincode) in test documents | Aadhaar pattern can false-positive on 12-digit institutional phone numbers preceded by `+91`; mitigated by negative lookbehind |
| Anonymisation Layer 2 | Strong detection of names, dates, and locations; `en_core_web_lg` misses ALL CAPS names common in Indian hospital records | `AllCapsPersonRecognizer` added as mitigation; Indian proper nouns occasionally still missed |
| Anonymisation Layer 3 | Successfully identifies implicit PHI (ejection fraction values, stent specifications, family relationship details) that Layers 1–2 miss | Probabilistic — not 100% recall; quality depends on document clarity and language ambiguity |
| Summarisation | Accurate extraction of structured fields from well-formatted ICSRs and SUGAM applications | Poorly formatted or scanned PDFs produce degraded extraction; audio transcription quality directly limits output quality |
| Completeness | Correctly identifies missing sections and generates specific, actionable notes | Checklist library currently covers 3 types (CT, NDA, SAE); custom checklist support not yet implemented |
| Classification | ICH E2A category assignment is consistent on clear narratives; WHO-UMC causality grading follows the published scale correctly | Ambiguous reports with incomplete timelines or missing dates produce lower-confidence classifications |
| Duplicate Detection | TF-IDF pre-filter correctly rejects clearly distinct cases at cosine < 0.20; blended scoring identifies paraphrased duplicates | Blended threshold (0.80) was set empirically; calibration on a real ICSR corpus would improve precision/recall |
| Inspection Report | Generates CDSCO-format reports with correct regulatory references (Schedule M, ICH E6, NDCT Rules) | Output accuracy is bounded by the quality of the raw input notes; the model cannot verify factual claims |

#### Key Limitations

1. **No ground truth validation** — the system has not been tested against a labelled ICSR corpus with expert annotations. Precision and recall figures are qualitative observations only.
2. **Document quality dependency** — scanned PDFs without OCR post-processing or audio recordings with poor transcription quality significantly degrade all modules.
3. **English-only processing** — the pipeline handles English text only. Regional language content (Hindi, Tamil, Telugu) in forms or ICFs is not processed.
4. **No real-time progress streaming** — processing a large document (200+ pages) can take 10–30 seconds; no intermediate progress feedback is shown during this time.
5. **API-dependent throughput** — all LLM calls depend on the Gemini API. Latency and rate limits are determined by the API provider, not the application.

---

### G. Implementation Plan

#### Short-term (1–3 months)

- Add an OCR preprocessing step (Tesseract or cloud OCR) for scanned PDFs to improve Layer 1 and Layer 2 recall
- Expand the checklist library to cover Schedule Y, Form CT-04, CIOMS Form II, and Investigator's Brochure templates
- Add real-time progress streaming via Server-Sent Events for long document processing
- Display entity confidence levels in the UI token breakdown table
- Add support for regional languages (Hindi, Tamil, Telugu) using multilingual NER models

#### Medium-term (3–6 months)

- Validate anonymisation accuracy against a de-identified hospital dataset reviewed by clinical informatics experts
- Add batch document upload (ZIP archives containing multiple ICSRs)
- Build a reviewer dashboard with case queue management, priority ranking, and processing status tracking
- Integrate with the SUGAM portal API for direct submission validation

#### Long-term (6–12 months)

- Develop a specialised Indian pharmaceutical NER model fine-tuned on labelled regulatory documents
- Integrate a Whisper-based audio transcription module to process meeting recordings directly
- Implement a reviewer feedback loop — incorrect classifications feed back into prompt refinement and example libraries
- Add differential privacy guarantees for the irreversible anonymisation step
- Publish an SDK for CDSCO system integration

#### Data Security and Retrieval

**Encryption at rest:** All PII originals are encrypted with Fernet (AES-128-CBC) before storage. Key rotation can be implemented by re-encrypting all records with a new key without changing the token values.

**Access control:** The token reversal endpoint (`/api/anonymize/reverse/{token}`) must be placed behind role-based authentication (OAuth2 / SAML SSO with CDSCO Active Directory) in production. It is currently open for hackathon evaluation purposes.

**Audit trail:** Every API call writes a record to the `processing_jobs` PostgreSQL table with module name, document type, timestamp, and processing duration. This provides a complete, tamper-evident audit log.

**Key management:** In production, `TOKEN_ENCRYPTION_KEY` should be moved to AWS KMS or HashiCorp Vault with automatic rotation and access logging.

**Data residency:** The PostgreSQL database and S3 bucket are in the `ap-south-1` (India) region, satisfying the DPDP Act 2023 data localisation requirement.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                                    │
│                   React 19 + Vite 8 SPA                                  │
│         6 Modules: Anonymisation · Summarisation · Completeness          │
│                    Comparison · Classification · Inspection Report        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ HTTPS (TLS 1.3)
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         NGINX 1.28 (Reverse Proxy)                       │
│  • Serves React static build from /var/www/cdsco-regai                  │
│  • Proxies /api/* → localhost:8000 (FastAPI)                            │
│  • client_max_body_size 200M · proxy_read_timeout 300s                  │
│  • SSL via Let's Encrypt (auto-renew via certbot timer)                 │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ HTTP (internal)
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND (Uvicorn, 2 workers)                  │
│                    Systemd service: cdsco-backend                        │
│                                                                          │
│  API Routes (all prefixed /api/)                                        │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐ │
│  │ /upload  │ │/anonymize │ │/summarize  │ │/classify │ │ /report  │ │
│  │ /health  │ │  /reverse │ │            │ │  /batch  │ │  /text   │ │
│  │ /jobs    │ │  /audit   │ │            │ │/duplicate│ │          │ │
│  └──────────┘ └─────┬─────┘ └─────┬──────┘ └────┬─────┘ └────┬─────┘ │
│               ┌─────┴─────────────┴──────────────┴────────────┴───┐    │
│               │            /compare   /completeness               │    │
│               └────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    MODULE LAYER                                    │   │
│  │  anonymizer.py · summarizer.py · completeness.py                 │   │
│  │  classifier.py · inspection_report.py                            │   │
│  └──────────────────┬───────────────────────────────────────────────┘   │
│                     │                                                    │
│  ┌──────────────────▼───────────────────────────────────────────────┐   │
│  │                    UTILITY LAYER                                   │   │
│  │                                                                    │   │
│  │  pii_rules.py          presidio_engine.py       file_handler.py  │   │
│  │  ┌─────────────┐       ┌──────────────────┐     ┌───────────┐   │   │
│  │  │ Regex Layer │       │ Presidio + spaCy │     │ PDF/DOCX/ │   │   │
│  │  │ 9 patterns  │       │ en_core_web_lg   │     │ TXT parse │   │   │
│  │  │ Phone gates │       │ 7 custom recog.  │     │ PyMuPDF   │   │   │
│  │  │ TF-IDF cos  │       │ Geo allowlist    │     │ mammoth   │   │   │
│  │  └─────────────┘       └──────────────────┘     └───────────┘   │   │
│  │                                                                    │   │
│  │  gemini_client.py                                                 │   │
│  │  ┌──────────────────────────────────────────────────────────┐    │   │
│  │  │  Gemini LLM API  (JSON output mode, 3-attempt retry)     │    │   │
│  │  │  Used by: Layer 3 anonymisation · summarisation ·         │    │   │
│  │  │           completeness · comparison · classification      │    │   │
│  │  │           · inspection report generation                  │    │   │
│  │  └──────────────────────────────────────────────────────────┘    │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────┐     ┌─────────────────────────┐
│  PostgreSQL 16           │     │  AWS S3 (ap-south-1)    │
│  cdsco_regai database    │     │                          │
│                          │     │  Secure document storage │
│  processing_jobs         │     │  (AES-256 server-side)  │
│  token_registry          │     │  India-region hosted     │
│    - token (indexed)     │     │  (DPDP Act 2023)        │
│    - original_encrypted  │     │                          │
│      (Fernet AES-128)    │     └─────────────────────────┘
│    - category            │
└──────────────────────────┘
```

### Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | React + Vite | 19 / 8 | SPA with custom dark UI, file dropzones, structured result rendering |
| Styling | Pure CSS custom properties | — | Dark theme; no UI framework dependency |
| HTTP Client | Axios | 1.x | API calls, multipart file upload |
| Backend | FastAPI + Python | 0.115 / 3.14 | REST API, async request handling, OpenAPI documentation |
| ASGI Server | Uvicorn | — | 2 workers, managed by systemd |
| Reverse Proxy | Nginx | 1.28 | Static file serving, API proxying, SSL termination |
| NER Engine | Presidio + spaCy | 2.x / lg | Named entity recognition with 7 custom recognisers |
| Encryption | Python cryptography (Fernet) | — | AES-128-CBC PII token storage |
| Database | PostgreSQL | 16 | Audit log, encrypted token registry |
| Storage | AWS S3 | — | Document storage, India region (`ap-south-1`) |
| SSL | Let's Encrypt + Certbot | — | Auto-renewing TLS certificates |
| Process Mgmt | systemd | — | Service lifecycle management and auto-restart |
| LLM | Gemini API | 2.5 Flash | Structured JSON generation for all AI modules |

---

## 4. Demo Guide (5 Minutes)

### Setup (before demo)
- Open https://cdsco.parchaa.com in browser
- Have test documents ready: `/home/ubuntu/cdsco_app/test_docs/`
- Open a second tab to https://cdsco.parchaa.com/api/docs for the interactive API documentation

---

### Minute 1 — Dashboard (30 sec)
- Show the dashboard: 6 modules, live system status showing DB and AI model connected
- Point to the Recent Activity panel — it populates with every document processed
- Say: "The entire stack is on a production server with SSL, PostgreSQL audit trail, and AWS S3 storage in India region for DPDP Act compliance"

### Minute 1–2 — Anonymisation (90 sec)
1. Navigate to **PII / PHI Anonymisation**
2. Upload `01_patient_case_record_ANONYMISE_THIS.docx`
3. Select **Pseudonymise** mode → click **Run Anonymisation**
4. While waiting: "The 3-layer pipeline is running — regex catches Aadhaar, PAN, phone; NER catches names and locations; AI catches implicit medical identifiers like lab values that reveal a diagnosis"
5. Show the result: point to the detection-by-layer breakdown and the Layer 1 regex match table showing original values and their tokens
6. Click **Copy text** — show the pseudonymised output
7. Key point: "Tokens are encrypted in PostgreSQL. Authorised personnel can reverse a token via the `/api/anonymize/reverse/` endpoint. Unauthorised access cannot"

### Minute 2–3 — SAE Classification (60 sec)
1. Navigate to **SAE Classification**
2. Paste the Cardivex rhabdomyolysis case text
3. Click **Classify Report**
4. Show: **Hospitalisation Required** (ICH E2A), PROBABLE causality, HIGH priority, with reviewer notes
5. Switch to **Duplicate Detection** — paste the same text in both fields
6. Show similarity score flagged as duplicate
7. Key point: "TF-IDF pre-filters obvious non-duplicates without an AI call. Only ambiguous cases go to the LLM. The blended score prevents both false positives and missed duplicates"

### Minute 3–4 — Completeness + Comparison (60 sec)
1. Navigate to **Completeness & Comparison**
2. Upload `04_SUGAM_CT_application_COMPLETENESS_CHECK.docx`
3. Select **Clinical Trial Application** → **Check Completeness**
4. Show: ~65% score, SAP missing, RMP missing, EC approvals pending — all flagged in red
5. Switch to **Document Comparison** tab
6. Upload `05a_protocol_v2_COMPARE_THESE.docx` and `05b_protocol_v3_COMPARE_THESE.docx`
7. Show: Major impact changes — sample size 300→450, 2→3 study arms, 12→18 month duration

### Minute 4–5 — Inspection Report + Summarisation (60 sec)
1. Navigate to **Inspection Report**
2. Upload `06_GMP_inspection_notes_GENERATE_REPORT.docx` → select **GMP Inspection**
3. Show the formatted report: Critical/Major/Minor findings, CAPA recommendations, Schedule M regulatory references
4. Click **Download** to demonstrate the full text export
5. Briefly show **Summarisation** with the SAE narration — structured output vs raw clinical text
6. Return to dashboard: Recent Activity now shows every job logged with timing — "complete audit trail of every document processed"

---

## 5. Speaking Points for Demo

### Opening
> "CDSCO reviewers process hundreds of drug applications, adverse event reports, and inspection findings every month — all manually. A single Clinical Trial Application can exceed 500 pages. A single SAE report can take a reviewer 45 minutes to read, classify, and log. We built RegAI to automate the routine validation tasks so officers can focus on decisions, not data entry."

### On Anonymisation
> "Patient data is the most sensitive part of any clinical submission. Under the DPDP Act 2023 and NDHM guidelines, sharing raw patient records — even internally — creates compliance exposure. Our system anonymises in three layers: structured regex for Aadhaar, PAN, and phone numbers; a trained NER model for names and locations; and an AI model for the implicit identifiers that neither layer can catch — like an ejection fraction value that reveals a diagnosis. Crucially, it's reversible. Every token maps back to the AES-encrypted original in the database. An authorised officer can reverse it. An unauthorised person cannot."

### On Classification
> "ICH E2A defines six seriousness categories. Misclassifying an adverse event delays safety signals by weeks. Our system maps to the exact ICH E2A definition, assigns WHO-UMC causality, and when you have a backlog of fifty cases it ranks them by priority. The most critical cases surface automatically — reviewers are not reading a flat list."

### On Completeness
> "Incomplete applications are the primary source of delay in drug approvals. A missing Statistical Analysis Plan sends the whole submission back — triggering weeks of round-trips. Our completeness checker identifies every missing mandatory item against the CDSCO checklist in seconds. The blocking items are flagged in red. A reviewer sees in 30 seconds what would have taken two hours of manual verification."

### On Duplicate Detection
> "Duplicate ICSRs inflate adverse event counts and distort safety signal analysis. Our two-stage detection uses TF-IDF cosine similarity as a fast pre-filter — if two reports are clearly different, we reject instantly without any AI call. If they're semantically similar, the AI does a deep field-by-field comparison and produces a blended score. The threshold is 0.80 — set to minimise both false positives and missed duplicates."

### On Architecture (for technical questions)
> "The backend is FastAPI with Uvicorn workers, running as a systemd service. Nginx handles SSL termination and static file serving. Every API call is logged to PostgreSQL with timing, giving a complete audit trail. Token encryption is AES-128-CBC Fernet. The entire stack is hosted in the AWS India region. The AI layer is the Gemini API with domain-specific prompting — we use prompt engineering rather than custom model training, which keeps the system immediately deployable and maintainable without ML infrastructure."

### On Limitations (be proactive)
> "We are transparent about what this system cannot do yet. It has not been validated against a labelled ICSR corpus, so precision and recall figures are qualitative. It processes English only — regional language support is on the roadmap. The AI layer is probabilistic — it will not catch 100% of edge cases. And throughput is dependent on the LLM API. The roadmap includes OCR integration, expanded checklist support, and a feedback loop from reviewer corrections."

### Closing
> "The system is live at cdsco.parchaa.com. Every document processed today is logged in the audit trail. Tokens are encrypted in the database. The SSL certificate auto-renews. This is not a prototype — it is a deployable system."

---

*Documentation updated: May 2026 | CDSCO RegAI v1.0.0*
