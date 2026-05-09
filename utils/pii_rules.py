"""
Layer 1 PII detection: regex patterns + context-aware phone detection.

Phone detection uses a 3-gate pipeline from india-ai-2026:
  Gate 1 → regex (10-digit Indian mobile starting 6-9)
  Gate 2 → keyword context window (40 chars before match)
  Gate 3 → false-positive filters (PIN codes, years, doc references)
"""
import re
import math
import threading
from dataclasses import dataclass, field
from typing import List, Tuple

PHONE_CONTEXT_KEYWORDS = {
    "phone", "mobile", "contact", "tel", "call", "whatsapp",
    "mob", "ph", "cell", "fax", "helpline", "number", "no",
}
PHONE_FP_KEYWORDS = {
    "article", "section", "ref", "clause", "para", "order",
    "schedule", "annexure", "form", "rule", "regulation",
}


@dataclass
class PIIMatch:
    category: str
    value: str
    start: int
    end: int
    token: str = ""


PATTERNS: List[Tuple[str, str]] = [
    # Aadhaar: negative lookbehind for '+' to avoid matching country-code-prefixed phone numbers
    ("Aadhaar Number",  r"(?<!\+)(?<!\d)[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}(?!\d)"),
    ("PAN Number",      r"\b[A-Z]{5}[0-9]{4}[A-Z]\b"),
    ("Passport Number", r"\b[A-PR-WYa-pr-wy][1-9]\d\s?\d{4}[1-9]\b"),
    ("Email",           r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
    ("Date of Birth",   r"\b(?:0?[1-9]|[12]\d|3[01])[\/\-](?:0?[1-9]|1[0-2])[\/\-](?:19|20)\d{2}\b"),
    # Patient / hospital IDs — labeled form (Patient ID: CH25016452) and prefix form
    ("Patient ID",      r"(?:Patient\s+ID|Encounter\s+ID|MRN|Reg(?:istration)?\s*No)[\.:\s#]+[A-Z0-9]{4,15}"),
    ("IP/OP Number",    r"\b(?:IP|OP|MRN|CH|OPCH)[\/\-\s]?\d{4,12}\b"),
    # Pincode: must not be part of DOI/ISSN/page refs (no preceding/trailing dash, dot, slash, or letter)
    ("Pincode",         r"(?<![A-Za-z0-9.\-\/])[1-9][0-9]{5}(?![A-Za-z0-9.\-\/])"),
    # Bank account: exclude numbers preceded by '+' (phone country codes)
    ("Bank Account",    r"(?<!\+)(?<!\d)\d{11,18}(?!\d)"),
    ("IFSC Code",       r"\b[A-Z]{4}0[A-Z0-9]{6}\b"),
    # Incident / near-miss / complaint report references (e.g. GMCH-NMI-2024-0089, IR-2024-001)
    ("Incident Report", r"\b[A-Z]{2,6}-[A-Z]{2,6}-\d{4}-\d{3,8}\b"),
    # Internal telephone extension numbers (e.g. Ext. 2241, Extn 442, x-7823)
    ("Extension Number", r"\bExt(?:n)?\.?\s*\d{3,5}\b"),
    # GPS coordinates — precise location identifiers (e.g. 17.4147425° N, 78.4841588° E)
    ("GPS Coordinates",  r"\b\d{1,3}\.\d{4,}\s*°?\s*[NSEWnsew]\b"),
]

_tl = threading.local()


def _get_counters() -> dict:
    if not hasattr(_tl, "counters"):
        _tl.counters = {}
    return _tl.counters


def _get_value_map() -> dict:
    """Maps original value → assigned token so the same value gets the same token."""
    if not hasattr(_tl, "value_map"):
        _tl.value_map = {}
    return _tl.value_map


def _make_token(category: str, value: str = "") -> str:
    """
    Return a numbered token for category. Same value always gets the same token
    within a request (referential consistency for pseudonymisation).
    """
    counters = _get_counters()
    value_map = _get_value_map()
    key = category.replace(" ", "_").upper()
    if value and value in value_map:
        return value_map[value]
    counters[key] = counters.get(key, 0) + 1
    token = f"[{key}_{counters[key]:03d}]"
    if value:
        value_map[value] = token
    return token


def _phone_context_ok(text: str, start: int) -> bool:
    """Gate 2: keyword within 40 chars before the match."""
    window = text[max(0, start - 40):start].lower()
    return any(kw in window for kw in PHONE_CONTEXT_KEYWORDS)


def _phone_fp_filter(text: str, start: int, value: str) -> bool:
    """Gate 3: reject if surrounded by doc-reference keywords."""
    window = text[max(0, start - 30):start + len(value) + 10].lower()
    if any(kw in window for kw in PHONE_FP_KEYWORDS):
        return False
    digits = re.sub(r"\D", "", value)
    # Reject 6-digit PINs embedded in longer strings
    if len(digits) == 6:
        return False
    # Reject year-like patterns
    if re.match(r"^(19|20)\d{2}$", digits):
        return False
    return True


def _detect_phones(text: str) -> List[PIIMatch]:
    matches = []
    for m in re.finditer(r"(?<!\d)[6-9]\d{9}(?!\d)", text):
        val = m.group()
        start = m.start()
        if _phone_context_ok(text, start) and _phone_fp_filter(text, start, val):
            matches.append(PIIMatch("Phone Number", val, start, m.end()))
    return matches


def rule_based_detect(text: str) -> List[PIIMatch]:
    matches: List[PIIMatch] = []
    for category, pattern in PATTERNS:
        for m in re.finditer(pattern, text):
            matches.append(PIIMatch(category, m.group(), m.start(), m.end()))
    matches.extend(_detect_phones(text))
    matches.sort(key=lambda x: x.start)
    # Remove overlaps (keep longest)
    deduped: List[PIIMatch] = []
    for m in matches:
        if deduped and m.start < deduped[-1].end:
            if (m.end - m.start) > (deduped[-1].end - deduped[-1].start):
                deduped[-1] = m
        else:
            deduped.append(m)
    return deduped


def pseudonymise(text: str, matches: List[PIIMatch]) -> str:
    _get_counters().clear()
    _get_value_map().clear()
    result = []
    prev = 0
    for m in sorted(matches, key=lambda x: x.start):
        result.append(text[prev:m.start])
        token = _make_token(m.category, m.value)
        m.token = token
        result.append(token)
        prev = m.end
    result.append(text[prev:])
    return "".join(result)


def irreversible_anonymise(text: str) -> str:
    def _age_bracket(age: int) -> str:
        lo = (age // 10) * 10
        return f"{lo}–{lo + 9}"

    # "45 years old" / "45 yrs old" → "40–49 years"
    text = re.sub(
        r"\b(\d{1,2})\s*(?:years?|yrs?)\s*old\b",
        lambda m: f"{_age_bracket(int(m.group(1)))} years",
        text, flags=re.IGNORECASE,
    )
    # Clinical notation: "45M" / "45F" / "45/M" / "45/F" → "40–49M"
    text = re.sub(
        r"\b(\d{1,2})\s*[\/]?\s*([MF])\b",
        lambda m: f"{_age_bracket(int(m.group(1)))}{m.group(2)}",
        text,
    )
    # Dates → Q-year
    def to_quarter(m):
        try:
            month = int(m.group(2))
            year = m.group(3)
            q = (month - 1) // 3 + 1
            return f"Q{q}-{year}"
        except Exception:
            return "Q?-????"
    text = re.sub(
        r"\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-]((19|20)\d{2})\b",
        to_quarter, text,
    )
    # Pincodes → first 3 digits + XXX
    text = re.sub(r"\b([1-9]\d{2})\d{3}\b", r"\1XXX", text)
    return text


def make_token(category: str, value: str = "") -> str:
    """Public wrapper so presidio_engine can use the same numbered token system."""
    return _make_token(category, value)


# ── TF-IDF cosine (from india-ai-2026) for duplicate pre-filter ───────────

_STOP_WORDS = {
    "the","a","an","and","or","but","in","on","at","to","for","of","with",
    "is","was","are","were","be","been","has","have","had","this","that",
    "it","its","from","by","as","not","no","so","if","he","she","they","we",
}


def _tfidf_vector(text: str) -> dict:
    words = re.findall(r"\w+", text.lower())
    words = [w for w in words if w not in _STOP_WORDS and len(w) > 2]
    total = len(words) or 1
    freq: dict = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    return {w: c / total for w, c in freq.items()}


def cosine_similarity(text1: str, text2: str) -> float:
    v1 = _tfidf_vector(text1)
    v2 = _tfidf_vector(text2)
    common = set(v1) & set(v2)
    if not common:
        return 0.0
    dot = sum(v1[w] * v2[w] for w in common)
    mag1 = math.sqrt(sum(x**2 for x in v1.values()))
    mag2 = math.sqrt(sum(x**2 for x in v2.values()))
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot / (mag1 * mag2)
