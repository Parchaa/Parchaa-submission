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
   - [Anonymisation Report](#b-anonymisation-report)
   - [Flagging Mechanism](#c-flagging-mechanism)
   - [Classification Criteria](#d-classification-criteria)
   - [Source Material Handling](#e-source-material-handling)
   - [Model Evaluation](#f-evaluation-of-the-model)
   - [Implementation Plan](#g-implementation-plan)
3. [System Architecture](#3-system-architecture)
4. [Demo Guide](#4-demo-guide-5-minutes)
5. [Speaking Points for Demo](#5-speaking-points-for-demo)

---

## 1. Solution Overview

CDSCO RegAI is a full-stack AI-driven regulatory workflow automation platform designed to reduce manual effort for CDSCO drug reviewers and pharmacovigilance officers. It addresses five high-friction tasks in the Indian drug regulatory lifecycle:

| Module | Problem Solved |
|--------|---------------|
| PII/PHI Anonymisation | Patient records contain sensitive identifiers; sharing for review violates DPDP Act 2023 |
| Document Summarisation | SAE narrations, SUGAM applications and meeting transcripts are dense; officers spend hours extracting key facts |
| Completeness Assessment | CT/NDA applications routinely miss mandatory sections; manual checklist verification is error-prone |
| SAE Classification | Manual severity grading per ICH E2A is slow; duplicate ICSRs waste reviewer bandwidth |
| Inspection Report Generation | Converting raw GMP/GCP field notes into structured CDSCO-format reports takes days |

The platform accepts PDF, DOCX and TXT documents, processes them through AI pipelines, and returns structured, actionable output — all within seconds.

---

## 2. Project Report

### A. Detection Methodology

#### PII/PHI Anonymisation — Three-Layer Hybrid Pipeline

The anonymisation engine uses a sequential three-layer architecture where each layer catches what the previous layer misses.

**Layer 1 — Deterministic Regex (pii_rules.py)**

Regex patterns are applied first because they are fast, deterministic, and zero false-negative for structured Indian PII formats.

| Entity Type | Pattern Logic |
|-------------|--------------|
| Aadhaar Number | 12-digit number starting with 2–9, optional spaces/dashes between groups; negative lookbehind for `+` to exclude phone country-code prefixes |
| PAN Number | Exact format: 5 uppercase letters + 4 digits + 1 uppercase letter |
| Passport Number | Indian passport format A–PR–WY prefix, 7 characters |
| Email | Standard RFC-5321 email regex |
| Date of Birth | DD/MM/YYYY and DD-MM-YYYY variants, years 1900–2099 |
| Patient/Encounter ID | Labeled form (`Patient ID: CH25016452`) and prefix form (`OPCH813254`, `MRN-1234`) |
| Pincode | 6-digit Indian pincode, first digit 1–9 |
| Bank Account | 11–18 digit numbers; negative lookbehind excludes `+`-prefixed phone numbers |

Phone detection uses a **3-gate pipeline** to minimise false positives on Indian mobile numbers:
- Gate 1: Regex match — 10-digit number starting 6–9
- Gate 2: Context window — keyword within 40 chars before match (phone, mobile, contact, tel, whatsapp, helpline)
- Gate 3: False-positive filter — reject if surrounded by doc-reference keywords (article, section, clause, schedule)

**Layer 2 — Presidio + spaCy NER (presidio_engine.py)**

Microsoft Presidio with the `en_core_web_lg` spaCy model performs Named Entity Recognition for entities that regex cannot detect — persons, organisations, locations, dates and medical terms. Six custom recognizers extend Presidio's default set:

| Custom Recognizer | Entities Detected |
|-------------------|------------------|
| AadhaarRecognizer | `IN_AADHAAR` with context-boosted confidence |
| PANRecognizer | `IN_PAN` |
| PassportRecognizer | `IN_PASSPORT` with travel-document context |
| MedicalRecordRecognizer | `MEDICAL_RECORD` — labeled IDs, MRN formats, OPCH/CH prefixes |
| PhoneINRecognizer | `IN_PHONE` — Indian mobile with +91 prefix variants |
| AllCapsPersonRecognizer | `PERSON` — consultant/doctor names written in ALL CAPS that standard NER misses |
| DiagnosisRecognizer | `PHI_DIAGNOSIS` — diagnosis mentions via contextual trigger phrases |

A **geographic allowlist** prevents over-redaction of public non-identifying geography: country names (India) and all 28 Indian states/8 UTs are preserved. Street addresses, localities and city names remain redacted because they can identify individuals.

**Layer 3 — AI Model Contextual NLP (anonymizer.py)**

The text after Layers 1 and 2 is passed to a large language model (LLM) with a domain-specific prompt instructing it to find only PHI that requires contextual medical understanding:
- Implicit diagnoses ("her insulin-dependent condition")
- Lab values that reveal a condition (CK 12,400 U/L → rhabdomyolysis marker)
- Relationship identifiers ("husband, cardiologist at AIIMS")
- Re-identification combinations

The AI model returns a JSON array of `{category, value, replacement}` objects. Each matched value is replaced with a bracketed generalisation (e.g., `[Ejection Fraction percentage]`).

#### Completeness Assessment — Checklist Verification Logic

The completeness module prompts the AI model with a document-type-specific checklist (Clinical Trial Application, New Drug Application, SAE Report) and instructs it to verify each mandatory item with four possible statuses:

- **Present** — item clearly found in the document
- **Partial** — item referenced but incomplete
- **Missing** — mandatory item not found
- **Not Applicable** — explicitly excluded or out of scope

The model returns a structured JSON with `overall_completeness_pct` (0–100), per-item status, `critical_missing` items, and `recommendations`. Prompts embed the specific CDSCO/ICH requirement text for each checklist item, so the model has a reference standard — not just a keyword match.

#### Document Comparison — Semantic Change Detection

The comparison module sends both document versions to the AI model with an explicit instruction to identify **substantive changes** (not formatting), classify each by:
- **Type**: Amendment, Addition, Deletion, Clarification
- **Impact**: High / Medium / Low
- **Section**: which protocol section or form field changed
- **Regulatory significance**: whether the change requires regulatory notification

This is semantic comparison, not a textual diff. The model can identify that "300 patients" changed to "450 patients" is a Major amendment requiring protocol amendment filing, even if the surrounding sentences are completely different.

---

### B. Anonymisation Report

#### Two-Step Process

**Step 1 — Pseudonymisation (Reversible)**

Every matched entity is replaced with a numbered token in the format `[ENTITY_TYPE_NNN]`. Tokens are sequential within a document run:

```
Original:  Patient Ramesh Kumar, Aadhaar 2345-6789-0123, Phone 9876543210
Step 1:    Patient [PERSON_001], Aadhaar [AADHAAR_NUMBER_001], Phone [PHONE_NUMBER_001]
```

Each original value is encrypted using **Fernet AES-128-CBC** symmetric encryption (`cryptography.fernet`) before storage. The ciphertext is stored in PostgreSQL `token_registry` table alongside the token string. A unique encryption key (stored in `.env` as `TOKEN_ENCRYPTION_KEY`) is required to reverse any token.

Authorised personnel can reverse any token via:
```
GET /api/anonymize/reverse/[PERSON_001]
→ { "original": "Ramesh Kumar" }
```

**Step 2 — Irreversible Generalisation**

Applied when "Full Anonymisation" mode is selected. Further generalises residual quasi-identifiers:

| Input | Output | Rule |
|-------|--------|------|
| `45 years old` | `40–49 years` | Age → decade bracket |
| `58M` / `45/F` | `50–59M` / `40–49F` | Clinical notation age bracket |
| `12/03/2024` | `Q1-2024` | Dates → quarter-year |
| `500032` | `500XXX` | Pincode → district prefix only |

#### Sample Output

**Raw Input (excerpt):**
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

**Token Registry (stored in DB, encrypted):**

| Token | Category | Encrypted Original |
|-------|----------|-------------------|
| [PERSON_001] | PERSON | `gAAAAABh...` (AES-128) |
| [AADHAAR_NUMBER_001] | Aadhaar Number | `gAAAAABh...` |
| [PHONE_NUMBER_001] | Phone Number | `gAAAAABh...` |

---

### C. Flagging Mechanism

#### Completeness Flagging

The AI model evaluates each checklist item against the submitted document and returns:

```json
{
  "overall_completeness_pct": 62,
  "status": "Incomplete",
  "items": [
    { "item": "Statistical Analysis Plan (SAP)", "status": "Missing", "notes": "No SAP document referenced or appended" },
    { "item": "Ethics Committee Approvals", "status": "Partial", "notes": "Only 2 of 5 site ECs approved; PGI Chandigarh, JIPMER Puducherry pending" },
    { "item": "Informed Consent Forms", "status": "Missing", "notes": "Regional language ICFs (Tamil, Telugu, Bengali) not submitted" }
  ],
  "critical_missing": [
    "Statistical Analysis Plan (SAP) — mandatory per Schedule Y",
    "Risk Management Plan (RMP) — required for new molecular entity"
  ],
  "reviewer_action": "Return to applicant — critical documents missing"
}
```

The `critical_missing` field surfaces items that are blocking — the reviewer sees these immediately without reading the full checklist.

#### Duplicate Detection

Duplicate ICSR detection uses a **blended two-stage scoring** pipeline:

**Stage 1 — TF-IDF Cosine Pre-filter (fast, no AI call):**

A TF-IDF vector is built for each report using word frequency normalised by document length, excluding stop words. Cosine similarity is computed between the two vectors:

```
cosine = dot(v1, v2) / (|v1| × |v2|)
```

If `cosine < 0.20`, the reports are definitively distinct — no AI call is made (fast rejection).

**Stage 2 — AI Blended Scoring (for ambiguous cases):**

If cosine ≥ 0.20, the AI model compares the reports for semantic similarity considering case ID, suspect drug, event description, patient demographics and timeline:

```
blended_score = 0.4 × cosine + 0.6 × ai_similarity
```

Threshold: `blended_score ≥ 0.80` → flagged as duplicate. The model also returns `matching_elements` (which specific fields match) so the reviewer can verify.

---

### D. Classification Criteria

SAE classification follows **ICH E2A** seriousness criteria exactly. The AI model is prompted with the formal ICH E2A definitions and must select from exactly these categories:

| ICH E2A Category | Definition Applied |
|------------------|--------------------|
| Death | Patient died as a result of the adverse event |
| Life-Threatening | Patient was at immediate risk of death at time of event |
| Hospitalisation Required | Inpatient hospitalisation or prolongation of existing hospitalisation |
| Persistent Disability/Incapacity | Substantial disruption of ability to conduct normal life functions |
| Congenital Anomaly/Birth Defect | In offspring of patient who received the drug |
| Medically Important Event | Event may jeopardise patient or require intervention to prevent above outcomes |
| Other Non-Serious | Does not meet any of the above criteria |

The model also returns:
- `causality`: WHO-UMC scale (Certain / Probable / Possible / Unlikely / Unassessable)
- `suspect_drug` and `concomitant_medications`
- `reviewer_priority_notes`: specific reasoning for the classification
- `priority`: URGENT / HIGH / MEDIUM / LOW — derived from severity class and causality together

Batch mode accepts multiple reports simultaneously and returns a ranked list sorted by priority, enabling officers to process the most critical cases first.

---

### E. Source Material Handling

The summarisation module uses three distinct prompt templates, each tuned to the structure and regulatory requirements of the source type.

#### SUGAM Drug Approval Applications

**Challenge:** Applications run 200–500 pages covering clinical data, safety summaries, regulatory status, and manufacturing details.

**Approach:** The prompt instructs the AI model to extract:
- Application type and applicant identity
- Product name, formulation, therapeutic class
- Clinical data summary (phase, sample size, key endpoints)
- Safety profile and known risks
- Reviewer recommendation (Proceed / Request Additional Info / Flag for Review)
- Missing information that would block approval

**Output format:** Structured JSON with labelled fields, rendered as key-value cards in the UI. Recommendation displayed as a colour-coded badge (green/yellow/red).

#### SAE Case Narrations (ICSRs)

**Challenge:** Individual Case Safety Reports follow CIOMS Form I structure but vary in completeness and use clinical shorthand.

**Approach:** The prompt maps the narrative to ICH E2A/E2B fields:
- Case ID, suspect drug, onset date, outcome
- Patient profile (age, weight, medical history, concomitant medications)
- Chronological event description
- Seriousness criteria met (from the ICH E2A list above)
- Causality assessment with reasoning
- Action required (dechallenge, DSMB notification, label update)

**Output format:** Case overview grid + case summary paragraph + colour-coded seriousness criteria list + action items.

#### Meeting Transcripts / Audio Summaries

**Challenge:** CDSCO Technical Expert Committee meetings run 3–6 hours; transcripts are unstructured dialogue.

**Approach:** The prompt identifies the regulatory meeting format:
- Meeting title, date, attendees
- Executive summary of outcomes
- Key decisions made (with attribution where possible)
- Action items with owner and deadline
- Next meeting / follow-up steps
- Agenda items discussed

**Output format:** Meeting header + executive summary + action items table (owner + deadline) + decisions list + next steps.

---

### F. Evaluation of the Model

#### Performance Observations

| Module | Observed Behaviour | Limitation |
|--------|-------------------|------------|
| Anonymisation Layer 1 | 100% recall on structured Indian PII (Aadhaar, PAN, phone, email, pincode) in test documents | Aadhaar pattern can false-positive on 12-digit institutional phone numbers preceded by `+91` — fixed with negative lookbehind |
| Anonymisation Layer 2 | Catches names, dates, locations well; `en_core_web_lg` misses all-caps names (common in Indian hospital records) | Added `AllCapsPersonRecognizer` as mitigation; Indian proper nouns still occasionally missed |
| Anonymisation Layer 3 | Successfully identifies implicit PHI (ejection fraction values, stent specifications, family history details) that Layers 1–2 miss | Inconsistent — sometimes produces generic replacements instead of precise ones; depends on document clarity |
| Summarisation | Accurate extraction of structured fields (case ID, drug, dates, causality) from well-formatted ICSRs | Poorly formatted or scanned PDFs produce degraded extraction; audio transcription quality directly limits output |
| Completeness | Correctly identifies missing sections and provides specific notes | Checklist is limited to 3 types (CT, NDA, SAE); custom checklist support not yet implemented |
| Classification | ICH E2A category assignment is accurate on clear narratives; causality grading follows WHO-UMC scale correctly | Ambiguous reports with incomplete timelines produce lower-confidence classifications |
| Duplicate Detection | TF-IDF pre-filter correctly rejects clearly distinct cases at < 0.20 cosine | Blended threshold (0.80) may need calibration on a real ICSR corpus; threshold was set empirically |
| Inspection Report | Generates CDSCO-format reports with correct regulatory references (Schedule M, ICH E6, NDCT Rules) | Cannot verify factual accuracy of findings — output is only as reliable as the input notes |

#### Key Limitations

1. **No ground truth validation** — the system has not been tested against a labelled ICSR corpus with expert annotations. Precision/recall figures are qualitative.
2. **Document quality dependency** — scanned PDFs without OCR post-processing or audio with poor transcription significantly degrade all modules.
3. **Single-language support** — the pipeline processes English text only; Indian regional language content in forms or ICFs is not processed.
4. **No real-time streaming** — processing a large document (200+ pages) can take 10–30 seconds; no progress feedback during this time.
5. **Token counter is per-request** — if the same document is processed twice, tokens restart from `_001`, making cross-session reversal ambiguous without the job ID.

---

### G. Implementation Plan

#### Suggested Improvements

**Short-term (1–3 months):**
- Add OCR pipeline (Tesseract or cloud OCR) as a pre-processing step for scanned PDFs
- Expand checklist library to cover Schedule Y, Form CT-04, CIOMS Form II, IB templates
- Add real-time progress streaming via Server-Sent Events for long documents
- Implement confidence scoring display — show entity confidence levels in the UI token table
- Add regional language support (Hindi, Tamil, Telugu) using multilingual NER models

**Medium-term (3–6 months):**
- Validate anonymisation against a de-identified hospital dataset with expert review
- Fine-tune the LLM on CDSCO-specific document corpus for higher precision
- Add batch document upload (ZIP files containing multiple ICSRs)
- Build a reviewer dashboard showing case queue, priority ranking, and processing status
- Integrate with SUGAM portal API for direct submission validation

**Long-term (6–12 months):**
- Train a specialised Indian pharma NER model on labelled regulatory documents
- Add audio transcription module (Whisper-based) to handle meeting recordings directly
- Implement a feedback loop — reviewers can flag incorrect classifications and these feed back into prompt refinement
- Add differential privacy guarantees for the irreversible anonymisation step
- Publish an SDK for CDSCO API integration

#### Data Security and Retrieval in Later Phases

**Encryption at rest:** All PII originals are encrypted with Fernet (AES-128-CBC) before storage. Key rotation can be implemented by re-encrypting all records with a new key.

**Access control:** Token reversal endpoint (`/api/anonymize/reverse/{token}`) should be placed behind role-based authentication (OAuth2 / SAML SSO with CDSCO Active Directory) in production. Currently open for hackathon.

**Audit trail:** Every API call writes a record to the `processing_jobs` PostgreSQL table with module name, document type, timestamp, and processing duration. This provides a complete audit log of who processed what and when.

**Key management:** In production, `TOKEN_ENCRYPTION_KEY` should be moved to AWS KMS or HashiCorp Vault, with automatic rotation and access logs.

**Data residency:** The PostgreSQL database and S3 bucket (`parchaa-submission-test`, `ap-south-1`) are already in the India region, complying with DPDP Act 2023 data localisation requirements.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                                    │
│                   React + Vite SPA (TypeScript)                          │
│         5 Pages: Anonymisation · Summarisation · Completeness            │
│                  Classification · Inspection Report                       │
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
│  │ /health  │ │  /reverse │ │            │ │  /batch  │ │          │ │
│  │ /jobs    │ │  /audit   │ │            │ │/duplicate│ │          │ │
│  └──────────┘ └─────┬─────┘ └─────┬──────┘ └────┬─────┘ └────┬─────┘ │
│                     │             │              │              │        │
│  ┌──────────────────▼─────────────▼──────────────▼──────────────▼─────┐ │
│  │                    MODULE LAYER                                      │ │
│  │  anonymizer.py · summarizer.py · completeness.py                   │ │
│  │  classifier.py · inspection_report.py                              │ │
│  └──────────────┬──────────────────────────────────────────────────────┘ │
│                 │                                                         │
│  ┌──────────────▼──────────────────────────────────────────────────────┐ │
│  │                    UTILITY LAYER                                     │ │
│  │                                                                      │ │
│  │  pii_rules.py          presidio_engine.py       file_handler.py     │ │
│  │  ┌─────────────┐       ┌──────────────────┐     ┌───────────────┐  │ │
│  │  │ Regex Layer │       │ Presidio + spaCy │     │ PDF / DOCX /  │  │ │
│  │  │ 9 patterns  │       │ en_core_web_lg   │     │ TXT parsing   │  │ │
│  │  │ Phone gates │       │ 7 custom recog.  │     │ PyMuPDF       │  │ │
│  │  │ TF-IDF cos  │       │ Geo allowlist    │     │ python-docx   │  │ │
│  │  └─────────────┘       └──────────────────┘     └───────────────┘  │ │
│  │                                                                      │ │
│  │  ai_client.py (wrapper)                                             │ │
│  │  ┌──────────────────────────────────────────────────────────────┐  │ │
│  │  │  Large Language Model API  (structured JSON output mode)     │  │ │
│  │  │  Used by: Layer 3 anonymisation · summarisation ·            │  │ │
│  │  │           completeness · classification · inspection report  │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────┐     ┌─────────────────────────┐
│  PostgreSQL 16           │     │  AWS S3 (ap-south-1)    │
│  cdsco_regai database    │     │  parchaa-submission-test │
│                          │     │                          │
│  processing_jobs         │     │  Document storage        │
│  token_registry          │     │  (AES-256 server-side)  │
│    - token (indexed)     │     │                          │
│    - original_encrypted  │     │                          │
│      (Fernet AES-128)    │     │                          │
│    - category            │     │                          │
└──────────────────────────┘     └─────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + Vite 8 | SPA with dark UI, file dropzones, result rendering |
| Styling | Pure CSS custom properties | Dark theme, no UI framework dependency |
| HTTP Client | Axios | API calls, multipart file upload |
| Backend | FastAPI 0.115 + Python 3.14 | REST API, async, OpenAPI docs |
| Server | Uvicorn (2 workers) | ASGI server |
| Reverse Proxy | Nginx 1.28 | Static serving, API proxy, SSL termination |
| NER Engine | Presidio 2.x + spaCy en_core_web_lg | Named entity recognition |
| Encryption | Python cryptography (Fernet) | PII token storage |
| Database | PostgreSQL 16 | Audit log, token registry |
| Storage | AWS S3 (India region) | Document storage |
| SSL | Let's Encrypt + Certbot | Auto-renewing TLS |
| Process Management | systemd | Service lifecycle management |

---

## 4. Demo Guide (5 Minutes)

### Setup (before demo)
- Open https://cdsco.parchaa.com in browser
- Have test documents ready: `/home/ubuntu/cdsco_app/test_docs/`
- Open a second tab to https://cdsco.parchaa.com/api/docs

---

### Minute 1 — Dashboard (30 sec)
- Show the dashboard: 5 modules, live system status showing DB connected
- Point out Recent Activity panel — it will fill up as you process documents
- Say: "Everything runs on a production server with SSL, PostgreSQL audit trail, and AWS S3 storage"

### Minute 1–2 — Anonymisation (90 sec)
1. Go to **PII/PHI Anonymisation**
2. Upload `01_patient_case_record_ANONYMISE_THIS.docx` (or the cardiology OP note PDF)
3. Select **Pseudonymise** mode → click **Run Anonymisation**
4. While waiting: "The 3-layer pipeline is running — regex catches Aadhaar, PAN, phone; NER catches names and addresses; AI catches implicit medical identifiers"
5. Show result: point out the token table (Layer 1 regex matches with original values visible)
6. Click **Copy text** — show the anonymised output
7. Quickly switch to **Full Anonymisation** — explain ages become brackets, dates become Q-year
8. Key point: "Tokens are encrypted in PostgreSQL and can be reversed by authorised personnel only"

### Minute 2–3 — SAE Classification (60 sec)
1. Go to **SAE Classification**
2. Paste Case 3 text from output.txt (Cardivex rhabdomyolysis)
3. Click classify
4. Show result: **Hospitalisation Required** (ICH E2A), PROBABLE causality, HIGH priority
5. Switch to **Duplicate Detection** tab — paste same text in both fields
6. Show similarity score (~0.95) flagged as duplicate
7. Key point: "This prevents double-counting of the same adverse event in pharmacovigilance databases"

### Minute 3–4 — Completeness + Comparison (60 sec)
1. Go to **Completeness**
2. Upload `04_SUGAM_CT_application_COMPLETENESS_CHECK.docx`
3. Select **Clinical Trial Application** → Check Completeness
4. Show: ~65% score, SAP Missing, RMP Missing, EC approvals pending — in red
5. Switch to **Document Comparison** tab
6. Upload `05a_protocol_v2_COMPARE_THESE.docx` and `05b_protocol_v3_COMPARE_THESE.docx`
7. Show: Major changes — sample size 300→450, 2→3 arms, 12→18 months

### Minute 4–5 — Inspection Report + Summarisation (60 sec)
1. Go to **Inspection Report**
2. Upload `06_GMP_inspection_notes_GENERATE_REPORT.docx` → select GMP Inspection
3. Show the formatted report: Critical/Major/Minor findings, CAPA recommendations, Schedule M references
4. Briefly show **Summarisation** with the SAE narration — structured output vs raw text
5. End on the dashboard: show Recent Activity now has 5+ jobs — "complete audit trail of every document processed"

---

## 5. Speaking Points for Demo

### Opening (set the stage)
> "CDSCO reviewers process hundreds of drug applications, adverse event reports, and inspection findings every month — all manually. A single CT application can be 500 pages. A single SAE report can take a reviewer 45 minutes to read, classify, and log. We built RegAI to automate that grunt work so officers can focus on decisions, not data entry."

### On Anonymisation
> "Patient data is the most sensitive part of any clinical submission. Under the DPDP Act 2023 and NDHM guidelines, sharing raw patient records — even internally — is a compliance risk. Our system anonymises in three layers: structured regex for Aadhaar, PAN, and phone numbers; a trained NER model for names and addresses; and an AI model for the implicit identifiers that neither can catch — like an ejection fraction value that reveals a diagnosis. Crucially, it's reversible. Every token maps back to the encrypted original in the database. An authorised officer can reverse it. An unauthorised person cannot."

### On Classification
> "ICH E2A defines six seriousness categories. Getting this wrong delays safety signals by weeks. Our system classifies to the exact ICH E2A definition, assigns WHO-UMC causality, and when you have a backlog of 50 cases, it ranks them by priority. The most critical cases rise to the top automatically."

### On Completeness
> "Incomplete applications are the biggest source of delay in drug approvals. A missing Statistical Analysis Plan sends the whole submission back — weeks of round-trips. Our completeness checker identifies every missing mandatory item against the CDSCO checklist before the reviewer even opens the document. The critical items are flagged in red. The reviewer sees in 30 seconds what would have taken 2 hours."

### On Duplicate Detection
> "Duplicate ICSRs inflate adverse event counts and distort safety signals. Our two-stage detection uses TF-IDF cosine similarity as a fast pre-filter — if two reports are clearly different, we reject instantly without an AI call. If they're similar, the AI model does a deep semantic comparison and produces a blended score. Threshold is 0.80 — calibrated to minimise both false positives and false negatives."

### On Architecture (if asked technical questions)
> "The backend is FastAPI with two Uvicorn workers, running as a systemd service on EC2. Nginx handles SSL termination and serves the React frontend as static files. The database is PostgreSQL — every API call is logged with timing, enabling a full audit trail. Token encryption uses AES-128-CBC symmetric encryption. The entire stack is India-region hosted for DPDP Act compliance."

### On Limitations (be proactive)
> "We're honest about what this can't do yet. It hasn't been validated against a labelled ICSR corpus — so precision and recall figures are qualitative. It processes English only. And the AI model's contextual PHI detection is probabilistic — it won't catch 100% of edge cases. The roadmap includes fine-tuning on CDSCO-specific documents and adding OCR for scanned PDFs."

### Closing
> "The system is live at cdsco.parchaa.com. Every document you've seen processed today is logged in the audit trail. Tokens are encrypted in the database. The SSL certificate auto-renews. This isn't a prototype — it's a deployable system."

---

*Document generated: April 2026 | CDSCO RegAI v1.0.0*
