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

  Layer 3 — Gemini NLP (contextual AI)
    Catches PHI that requires medical domain understanding:
    implicit diagnoses, clinical relationships, re-identification combos.

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


GEMINI_PROMPT = """You are a medical data privacy expert specialising in Indian healthcare regulations (DPDP Act 2023, NDHM).

The text below has already been processed by regex patterns and a Presidio NER model.
Remaining PII/PHI that requires contextual medical understanding must be caught now.

Find ONLY entities that require CONTEXTUAL UNDERSTANDING — do NOT re-flag already-tokenised
placeholders like [PERSON_001] or [AADHAAR_NUMBER_001].

Focus on:
- Implicit diagnoses ("the patient's HIV status", "her insulin-dependent condition")
- Medical record inferences (lab values that reveal a condition)
- Relationships that enable re-identification ("husband, a cardiologist at AIIMS")
- Combinations that create re-identification risk

Return a JSON array. Each element:
  "category": PHI type (Diagnosis, Medication, Implicit_Identity, Medical_History, Relationship, Other_PHI)
  "value": exact substring from the text
  "replacement": safe generalised replacement text

Return [] if nothing additional found. Return ONLY valid JSON, no commentary.

Text:
\"\"\"
{text}
\"\"\"
"""


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

    # ── Layer 2: Presidio + spaCy NER (numbered tokens) ──────────────────
    layer2_entities = []
    try:
        from utils.presidio_engine import presidio_tokenize
        layer2_result = presidio_tokenize(step1_text)
        step1_text = layer2_result["anonymized_text"]
        layer2_entities = layer2_result["entities_found"]
    except Exception as e:
        layer2_entities = []

    # ── Layer 3: Gemini contextual NLP ───────────────────────────────────
    layer3_matches = []
    try:
        prompt = GEMINI_PROMPT.format(text=step1_text[:20000])
        response = client.models.generate_content(model=model_name, contents=prompt)
        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?", "", raw).rstrip("`").strip()
        layer3_matches = json.loads(raw) if raw else []
        for item in layer3_matches:
            if isinstance(item, dict) and "value" in item and "replacement" in item:
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
                "layer": "3 — Gemini AI",
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
