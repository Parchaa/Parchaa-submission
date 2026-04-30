"""
Presidio-based PII/PHI detection with custom Indian PII recognizers.

Architecture (three-layer hybrid):
  Layer 1 — Regex (pii_rules.py)    : structured patterns (Aadhaar, PAN, etc.)
  Layer 2 — Presidio + spaCy NER    : names, organisations, locations, dates, medical
  Layer 3 — Gemini NLP              : contextual PHI in medical narratives

Presidio gives us a trained NER model (en_core_web_lg) so we catch PERSON, ORG,
GPE, DATE entities that regex can never find. Custom recognizers extend it for
Indian-specific identifiers that Presidio doesn't ship with.
"""
import re
from typing import List, Optional

from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern, RecognizerResult
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig


# ── Custom Indian PII recognizers ─────────────────────────────────────────

class AadhaarRecognizer(PatternRecognizer):
    PATTERNS = [Pattern("AADHAAR", r"\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b", 0.95)]
    CONTEXT = ["aadhaar", "uid", "unique identification"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_AADHAAR",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
        )


class PANRecognizer(PatternRecognizer):
    PATTERNS = [Pattern("PAN", r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", 0.95)]
    CONTEXT = ["pan", "permanent account", "income tax"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_PAN",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
        )


class PassportRecognizer(PatternRecognizer):
    PATTERNS = [Pattern("PASSPORT_IN", r"\b[A-PR-WYa-pr-wy][1-9]\d\s?\d{4}[1-9]\b", 0.85)]
    CONTEXT = ["passport", "travel document"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_PASSPORT",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
        )


class MedicalRecordRecognizer(PatternRecognizer):
    PATTERNS = [
        # Standard prefix + digits: IP/1234, MRN-5678, OPCH813254, CH25016452
        Pattern("MRN", r"\b(?:IP|OP|MRN|CR|CH|OPCH)[\/\-\s]?[A-Z0-9]{4,12}\b", 0.90),
        # Labeled form: "Patient ID : CH25016452", "Encounter ID : OPCH813254"
        Pattern("LABELED_ID", r"(?:Patient\s+ID|Encounter\s+ID)\s*[:#]?\s*[A-Z0-9]{4,15}", 0.95),
        Pattern("REGN_NO", r"\b(?:Reg(?:istration)?\.?\s*No\.?\s*:?\s*)\d{4,12}\b", 0.85),
    ]
    CONTEXT = ["patient", "record", "registration", "hospital", "admission", "discharge", "encounter"]

    def __init__(self):
        super().__init__(
            supported_entity="MEDICAL_RECORD",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
        )


class AllCapsPersonRecognizer(PatternRecognizer):
    """Catch doctor/consultant names written in ALL CAPS that spaCy NER misses.
    Matches 2–4 uppercase initials or words following a title or labeled field.
    """
    PATTERNS = [
        # "Consultant : DR. C V N MURTHY" or "Dr. C V N MURTHY MBBS"
        Pattern("ALLCAPS_NAME", r"(?:Dr\.?|Prof\.?|Mr\.?|Mrs\.?|Ms\.?)\s+[A-Z](?:\s+[A-Z]){0,3}\s+[A-Z]{2,}", 0.85),
        # Labeled: "Consultant : <NAME>" where name is 2+ all-caps words
        Pattern("CONSULTANT_NAME", r"(?:Consultant|Physician|Surgeon|Doctor)\s*[:#]\s*(?:Dr\.?\s+)?[A-Z][A-Z\s]{4,30}", 0.90),
    ]
    CONTEXT = ["consultant", "doctor", "physician", "surgeon", "attending", "dr"]

    def __init__(self):
        super().__init__(
            supported_entity="PERSON",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
        )


class PhoneINRecognizer(PatternRecognizer):
    PATTERNS = [Pattern("PHONE_IN", r"\b(?:\+91[-\s]?)?[6-9]\d{9}\b", 0.90)]
    CONTEXT = ["phone", "mobile", "contact", "call", "tel"]

    def __init__(self):
        super().__init__(
            supported_entity="IN_PHONE",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
        )


class DiagnosisRecognizer(PatternRecognizer):
    """Detect diagnosis/condition mentions via keyword context."""
    PATTERNS = [
        Pattern(
            "DIAGNOSIS_CONTEXT",
            r"\b(?:diagnosed with|suffering from|known case of|history of|positive for|"
            r"treated for|presenting with|complaints of)\s+[\w\s,]{3,50}",
            0.70,
        )
    ]
    CONTEXT = ["diagnosis", "condition", "disease", "disorder", "syndrome"]

    def __init__(self):
        super().__init__(
            supported_entity="PHI_DIAGNOSIS",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
        )


# ── Geographic allowlist: public non-identifying locations ────────────────
# Countries and Indian states/UTs are public knowledge and do NOT identify an
# individual. Streets, localities, and cities remain redacted.
_GEO_ALLOWLIST = {
    # Country
    "india", "indian",
    # 28 States
    "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh",
    "goa", "gujarat", "haryana", "himachal pradesh", "jharkhand", "karnataka",
    "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram",
    "nagaland", "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu",
    "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal",
    # Union Territories (administrative, not street-level)
    "jammu and kashmir", "ladakh", "lakshadweep",
    "andaman and nicobar islands", "andaman and nicobar",
    "dadra and nagar haveli and daman and diu",
    # Common abbreviated forms
    "j&k", "j & k",
}


def _is_suppressed_geo(entity_type: str, text: str) -> bool:
    """Return True if this entity is a LOCATION that maps to a country or state name."""
    if entity_type != "LOCATION":
        return False
    return text.strip().lower() in _GEO_ALLOWLIST


# ── Engine initialisation (singleton) ─────────────────────────────────────

_analyzer: Optional[AnalyzerEngine] = None
_anonymizer: Optional[AnonymizerEngine] = None


def _build_analyzer() -> AnalyzerEngine:
    provider = NlpEngineProvider(nlp_configuration={
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "en", "model_name": "en_core_web_lg"}],
    })
    nlp_engine = provider.create_engine()
    engine = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])
    for recognizer in [
        AadhaarRecognizer(),
        PANRecognizer(),
        PassportRecognizer(),
        MedicalRecordRecognizer(),
        PhoneINRecognizer(),
        DiagnosisRecognizer(),
        AllCapsPersonRecognizer(),
    ]:
        engine.registry.add_recognizer(recognizer)
    return engine


def get_analyzer() -> AnalyzerEngine:
    global _analyzer
    if _analyzer is None:
        _analyzer = _build_analyzer()
    return _analyzer


def get_anonymizer() -> AnonymizerEngine:
    global _anonymizer
    if _anonymizer is None:
        _anonymizer = AnonymizerEngine()
    return _anonymizer


# ── Public API ─────────────────────────────────────────────────────────────

ENTITY_TYPES = [
    "PERSON", "LOCATION", "ORG", "DATE_TIME", "EMAIL_ADDRESS", "PHONE_NUMBER",
    "URL", "MEDICAL_LICENSE", "NRP",
    "IN_AADHAAR", "IN_PAN", "IN_PASSPORT", "IN_PHONE", "MEDICAL_RECORD", "PHI_DIAGNOSIS",
]


def presidio_detect(text: str) -> List[dict]:
    """Run Presidio analysis and return list of detected entities."""
    analyzer = get_analyzer()
    results = analyzer.analyze(text=text, language="en", entities=ENTITY_TYPES)
    return [
        {
            "entity_type": r.entity_type,
            "start": r.start,
            "end": r.end,
            "score": round(r.score, 3),
            "text": text[r.start:r.end],
        }
        for r in sorted(results, key=lambda x: x.start)
        if not _is_suppressed_geo(r.entity_type, text[r.start:r.end])
    ]


def presidio_tokenize(text: str) -> dict:
    """
    Run Presidio NER and replace each entity with a numbered token
    using the same [ENTITY_TYPE_001] format as Layer 1 regex.
    Returns anonymized_text and a list of {entity_type, text, token, score} dicts.
    This makes Layer 2 tokens reversible via the same token_registry.
    """
    from utils.pii_rules import make_token

    analyzer = get_analyzer()
    results = analyzer.analyze(text=text, language="en", entities=ENTITY_TYPES)
    # Sort descending so replacing by position doesn't shift subsequent offsets
    results_sorted = sorted(results, key=lambda r: r.start, reverse=True)

    chars = list(text)
    entity_records = []
    for r in results_sorted:
        original = text[r.start:r.end]
        if _is_suppressed_geo(r.entity_type, original):
            continue
        token = make_token(r.entity_type)
        chars[r.start:r.end] = list(token)
        entity_records.append({
            "entity_type": r.entity_type,
            "text": original,
            "token": token,
            "score": round(r.score, 3),
        })

    return {
        "anonymized_text": "".join(chars),
        "entities_found": entity_records,
    }


def presidio_anonymize(text: str, operator: str = "replace") -> dict:
    """
    Anonymise text using Presidio operators.
    operator: 'replace' → <ENTITY_TYPE>, 'mask' → ******, 'hash' → SHA256
    """
    analyzer = get_analyzer()
    anonymizer = get_anonymizer()

    results = analyzer.analyze(text=text, language="en", entities=ENTITY_TYPES)

    op_config = {}
    for entity in ENTITY_TYPES:
        if operator == "replace":
            op_config[entity] = OperatorConfig("replace", {"new_value": f"<{entity}>"})
        elif operator == "mask":
            op_config[entity] = OperatorConfig("mask", {"masking_char": "*", "chars_to_mask": 100, "from_end": False})
        else:
            op_config[entity] = OperatorConfig("replace", {"new_value": f"<{entity}>"})

    anonymized = anonymizer.anonymize(
        text=text,
        analyzer_results=results,
        operators=op_config,
    )
    return {
        "anonymized_text": anonymized.text,
        "entities_found": [
            {"type": r.entity_type, "text": text[r.start:r.end], "score": round(r.score, 3)}
            for r in results
        ],
    }
