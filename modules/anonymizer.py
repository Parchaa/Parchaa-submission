"""
Hybrid PII/PHI anonymisation pipeline — three layers:

  Layer 1 — Regex (pii_rules.py)
    Deterministic detection of structured Indian PII:
    Aadhaar, PAN, Passport, Phone, Email, Dates, Pincodes, MRNs.
    Tokens: [AADHAAR_NUMBER_001], [PHONE_NUMBER_001] etc.

  Layer 2 — Presidio + spaCy NER (presidio_engine.py)
    Microsoft Presidio with en_core_web_lg model.
    Detects PERSON, ORG, LOCATION, DATE_TIME via trained NER.
    Now uses the same numbered token format: [PERSON_001], [LOCATION_001] etc.
    All Layer 2 tokens are also stored in token_registry for reversal.

  Layer 3 — AI contextual / quasi-identifier detection
    Mode-specific prompts (pseudo vs full). Catches:
    reference numbers (scheme cards, incident refs, extensions),
    facility identifiers, clinical quasi-identifiers (exact lab values,
    measurements), employment details, and re-identification combinations.

Two-step anonymisation (DPDP Act 2023 / NDHM compliant):
  Step 1 — Pseudonymisation: replace with reversible [TOKEN_001] tokens.
           Token ↔ original value AES-encrypted and stored in PostgreSQL.
           Authorised reversal via /api/anonymize/reverse/{token}.
  Step 2 — Irreversible: generalise residual identifiers (ages → brackets,
           dates → Q-year, pincodes → prefix). Suitable for research release.
"""
import json
import re
import time
from typing import Dict, List

from utils.pii_rules import rule_based_detect, pseudonymise, irreversible_anonymise


_GEMINI_PROMPT_PSEUDO = """You are a medical data privacy specialist trained in DPDP Act 2023, NDHM, ICMR research ethics guidelines, and CDSCO pharmacovigilance standards.

Layers 1 (regex) and 2 (Presidio NER) have already run. Their output is in the text as [TOKEN_NNN] placeholders.
Your job: catch EVERYTHING they missed. Err on the side of over-anonymisation — in clinical/regulatory data, a missed identifier is worse than an extra redaction.

=== WHAT TO DETECT ===

REFERENCE & ADMINISTRATIVE NUMBERS (catch every occurrence):
- Health scheme card numbers (e.g. MJPJAY-MH-2023-7731209, PMJAY-MH-..., AB-MGRSBY-...)
- Incident / near-miss / complaint report numbers (e.g. GMCH-NMI-2024-0089, IR-2024-...)
- Internal telephone extension numbers (e.g. Ext. 2241, Extn 442, x-7823)
- Employee / staff IDs not already tokenised
- Medical council registration numbers
- Any institutional alphanumeric reference code

FACILITY & LOCATION IDENTIFIERS:
- Hospital names with a city or district (e.g. "Govt. Medical College & Hospital, Nagpur")
- Clinic, nursing home, or diagnostic centre names
- Named wards, units, or departments when combined with location

CLINICAL QUASI-IDENTIFIERS (exact values that enable re-identification in combination):
- Specific lab values with numbers: eGFR with exact figure, HbA1c%, Hb g/dL, K+ mEq/L, creatinine, urea
- Specific organ measurements (e.g. "R: 7.8 cm, L: 7.4 cm")
- Specific cardiac parameters together (e.g. "EF 48%, mild LVH, Grade 1 diastolic dysfunction")
- Specific drug doses with patient-specific context ("Cloxacillin 2g IV QDS — dose adjusted for renal function")
- Urine output with exact volume and time window

SCHEME / PROGRAMME IDENTIFIERS:
- Government scheme names tied to a patient with any associated number or card
- Insurance policy numbers

EMPLOYMENT & CONTEXTUAL IDENTIFIERS:
- Employer name + employee ID combination
- Language/dialect specifics combined with location ("patient speaks Marathi only, wife speaks some Hindi")

DO NOT flag:
- [TOKEN_NNN] placeholders already in the text
- Generic drug names, general diagnosis labels, common medical abbreviations

=== OUTPUT FORMAT ===
For each detection:
  "category": one of [Facility_ID, Reference_Number, Lab_Value, Scheme_ID, Clinical_PHI, Employment, Other_PHI]
  "value": exact substring from the text — must be copy-paste exact
  "replacement": UPPERCASE_SNAKE_CASE token (e.g. FACILITY_NAME, SCHEME_CARD, INCIDENT_REF, EXTENSION_NUMBER, LAB_VALUE, CLINICAL_PARAMS)

Return a JSON array. Return [] if nothing found. Return ONLY valid JSON, no commentary, no markdown fences.

Text:
\"\"\"
{text}
\"\"\""""

_GEMINI_PROMPT_FULL = """You are a medical data privacy specialist trained in DPDP Act 2023, NDHM, ICMR research ethics guidelines, and CDSCO pharmacovigilance standards.

Layers 1 (regex) and 2 (Presidio NER) have already run. Their output is in the text as [TOKEN_NNN] placeholders.
Mode: FULL IRREVERSIBLE ANONYMISATION — for research sharing and public release.
Your job: catch everything missed by Layers 1-2 and replace each with a NATURAL LANGUAGE GENERALISATION (not a token). Be more aggressive than pseudonymisation.

=== WHAT TO DETECT AND HOW TO REPLACE ===

REFERENCE & ADMINISTRATIVE NUMBERS:
- Health scheme card numbers (MJPJAY-MH-..., PMJAY-...) → "a state health scheme card number"
- Incident / near-miss report numbers (GMCH-NMI-..., IR-...) → "an incident report reference"
- Internal extension numbers (Ext. 2241, Extn 442) → "an internal extension"
- Employee / staff IDs → "a staff identifier"
- Medical registration numbers not already tokenised → "a registration number"
- Any institutional reference code → "an administrative reference"

FACILITY & LOCATION IDENTIFIERS:
- Hospital name with city (e.g. "Govt. Medical College & Hospital, Nagpur") → "a government medical facility"
- Private hospital with name → "a private hospital"
- Named ward/unit with location context → "a specialty unit"

CLINICAL QUASI-IDENTIFIERS — generalise, do not delete:
- "eGFR: 6 ml/min" → "severely reduced eGFR"
- "HbA1c: 11.4%" → "poorly controlled HbA1c"
- "Hb: 7.1 g/dL" → "low haemoglobin"
- "K+: 6.2 mEq/L" → "elevated potassium"
- "Na+: 131" → "mild hyponatraemia"
- "R: 7.8 cm, L: 7.4 cm" → "bilateral renal atrophy"
- "EF 48%, mild LVH, Grade 1 diastolic dysfunction" → "mildly reduced cardiac function with LVH"
- "urine output [date] ~280 mL (oliguria)" → "oliguric urine output"
- Specific drug dose + patient-specific note → "an appropriate dose adjusted for renal function"
- Fasting/random blood sugar with exact value → "an elevated blood sugar value"

SCHEME / PROGRAMME IDENTIFIERS:
- Government scheme name + patient card → "a state-sponsored health scheme"

EMPLOYMENT & CONTEXTUAL IDENTIFIERS:
- Employer name + employee ID → "a public sector employer"
- Language/dialect specifics → "a regional language"

DO NOT flag:
- [TOKEN_NNN] placeholders already in the text
- Generic drug names, general diagnosis labels

=== OUTPUT FORMAT ===
For each detection:
  "category": one of [Facility_ID, Reference_Number, Lab_Value, Scheme_ID, Clinical_PHI, Employment, Other_PHI]
  "value": exact substring from the text — must be copy-paste exact
  "replacement": natural language generalisation that reads naturally when substituted in context (no all-caps, no brackets — the code will wrap it)

Return a JSON array. Return [] if nothing found. Return ONLY valid JSON, no commentary, no markdown fences.

Text:
\"\"\"
{text}
\"\"\""""


def run_anonymisation(text: str, client, model_name: str, mode: str = "pseudonymise") -> Dict:
    """
    Full three-layer anonymisation pipeline.

    Returns:
      anonymized_text   — final output
      step1_text        — after pseudonymisation (for debug/audit)
      all_entities      — merged list across all layers (for UI display)
      rule_matches      — Layer 1 regex hits (with original value + token)
      layer3_matches    — Layer 3 Gemini hits
      job_id            — DB audit record ID
      total_entities    — count for display
    """
    t0 = time.time()

    # ── Layer 1: Regex ────────────────────────────────────────────────────
    rule_matches = rule_based_detect(text)
    step1_text = pseudonymise(text, rule_matches)

    # ── Pre-Layer-2: Facility name detection (must run before Presidio splits city names) ──
    import re as _re
    _FACILITY_PATTERN = _re.compile(
        r"(?:Govt\.?|Government|Civil|District|Municipal|Primary|Community|ESIC|AIIMS|GMC)\s+"
        r"(?:Medical\s+)?(?:College\s+)?(?:&\s+)?(?:Hospital|Health\s+Centre|Dispensary|Clinic)"
        r"(?:[,\s]+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)?",
        _re.IGNORECASE,
    )
    facility_entities = []
    for _m in _FACILITY_PATTERN.finditer(step1_text):
        _val = _m.group().strip().rstrip(',')
        if len(_val) > 10:
            from utils.pii_rules import make_token as _make_token
            _tok = _make_token("Facility Name")
            facility_entities.append({
                "entity_type": "FACILITY",
                "text": _val,
                "token": _tok,
                "score": 1.0,
            })
            step1_text = step1_text[:_m.start()] + _tok + step1_text[_m.start() + len(_val):]
            break  # re-scan after replacement to keep offsets valid

    # Re-scan for remaining facility names after first replacement
    _offset = 0
    for _m in list(_FACILITY_PATTERN.finditer(step1_text)):
        _val = _m.group().strip().rstrip(',')
        if len(_val) > 10 and not any(e["text"] == _val for e in facility_entities):
            from utils.pii_rules import make_token as _make_token
            _tok = _make_token("Facility Name")
            facility_entities.append({
                "entity_type": "FACILITY",
                "text": _val,
                "token": _tok,
                "score": 1.0,
            })
            step1_text = step1_text.replace(_val, _tok, 1)

    # ── Layer 2: Presidio + spaCy NER (numbered tokens) ──────────────────
    layer2_entities = list(facility_entities)
    try:
        from utils.presidio_engine import presidio_tokenize
        layer2_result = presidio_tokenize(step1_text)
        step1_text = layer2_result["anonymized_text"]
        layer2_entities += layer2_result["entities_found"]
    except Exception as e:
        layer2_entities = []

    # ── Layer 3: AI contextual / quasi-identifier detection ──────────────
    layer3_matches = []
    try:
        prompt_template = _GEMINI_PROMPT_FULL if mode == "full" else _GEMINI_PROMPT_PSEUDO
        prompt = prompt_template.format(text=step1_text)
        response = client.models.generate_content(model=model_name, contents=prompt)
        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?", "", raw).rstrip("`").strip()
        layer3_matches = json.loads(raw) if raw else []
        for item in layer3_matches:
            if isinstance(item, dict) and item.get("value") and item.get("replacement"):
                step1_text = step1_text.replace(item["value"], f"[{item['replacement']}]")
    except Exception:
        pass

    # ── Step 2: Irreversible anonymisation ────────────────────────────────
    final_text = step1_text
    if mode == "full":
        final_text = irreversible_anonymise(step1_text)

    # ── Build entity list for UI ──────────────────────────────────────────
    all_entities = []
    for m in rule_matches:
        all_entities.append({
            "layer": "1 — Regex",
            "category": m.category,
            "value": m.value,
            "token": m.token,
            "confidence": "High",
        })
    for e in layer2_entities:
        all_entities.append({
            "layer": "2 — Presidio/NER",
            "category": e.get("entity_type", ""),
            "value": e.get("text", ""),
            "token": e.get("token", ""),
            "confidence": f"{e.get('score', 0):.0%}",
        })
    for item in layer3_matches:
        if isinstance(item, dict) and "value" in item:
            all_entities.append({
                "layer": "3 — AI Model",
                "category": item.get("category", "PHI"),
                "value": item.get("value", ""),
                "token": f"[{item.get('replacement', 'REDACTED')}]",
                "confidence": "Contextual",
            })

    # ── Persist to DB ─────────────────────────────────────────────────────
    duration_ms = int((time.time() - t0) * 1000)
    job_id = ""
    try:
        from database import log_job, save_tokens, save_result

        job_id = log_job(
            module="anonymisation",
            doc_type=mode,
            duration_ms=duration_ms,
        )

        # All tokens that can be reversed: Layer 1 (value stored) + Layer 2 (text stored)
        all_token_records = [
            {"value": m.value, "token": m.token, "category": m.category}
            for m in rule_matches if m.token
        ] + [
            {"value": e.get("text", ""), "token": e.get("token", ""), "category": e.get("entity_type", "")}
            for e in layer2_entities if e.get("token")
        ]
        save_tokens(job_id, all_token_records)

        save_result(job_id, "anonymisation", {
            "total_entities": len(all_entities),
            "mode": mode,
            "layers": {
                "regex": len(rule_matches),
                "presidio": len(layer2_entities),
                "gemini": len(layer3_matches),
            },
        })
    except Exception:
        pass

    return {
        "step1_text": step1_text,
        "final_text": final_text,
        "all_entities": all_entities,
        "rule_matches": [
            {"category": m.category, "value": m.value, "token": m.token}
            for m in rule_matches
        ],
        "layer3_matches": layer3_matches,
        "job_id": job_id,
        "total_entities": len(all_entities),
    }
