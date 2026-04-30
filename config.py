"""
Central configuration — reads all secrets from .env at startup.

Edit .env (never this file) to change credentials.
"""
import os
from dotenv import load_dotenv
import google.genai as genai

load_dotenv()   # loads .env into os.environ at import time

# ── Gemini ────────────────────────────────────────────────────────────────
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL    = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_MODEL_PRO = "gemini-1.5-pro"

# ── PostgreSQL ────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://cdsco:cdsco123@localhost:5432/cdsco_regai")

# ── AWS S3 ────────────────────────────────────────────────────────────────
AWS_ACCESS_KEY_ID     = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION            = os.getenv("AWS_REGION", "ap-south-1")
S3_BUCKET             = os.getenv("S3_BUCKET", "")

# ── App metadata ──────────────────────────────────────────────────────────
APP_TITLE = "CDSCO RegAI — Regulatory Workflow Automation"
APP_ICON  = "🏥"

# ── Gemini client (singleton) ─────────────────────────────────────────────
_client = None

def _auto_init():
    """Auto-initialise Gemini from .env key if present."""
    global _client
    if GEMINI_API_KEY and not _client:
        _client = genai.Client(api_key=GEMINI_API_KEY)

_auto_init()

def init_gemini(api_key: str):
    """Called when user types a key in the sidebar (overrides .env)."""
    global _client
    _client = genai.Client(api_key=api_key)

def get_client():
    return _client

def get_model(pro: bool = False):
    return GEMINI_MODEL_PRO if pro else GEMINI_MODEL


# ── CDSCO domain constants ────────────────────────────────────────────────
CHECKLIST_ITEMS = {
    "Clinical Trial Application": [
        "Form CT-04 (Application Form)", "Protocol Document", "Investigator's Brochure",
        "Informed Consent Form (ICF)", "Patient Information Sheet", "Ethics Committee Approval",
        "Site details and CV of Principal Investigator", "GCP Compliance Certificate",
        "Previous clinical trial data (Phase I/II)", "Risk-Benefit Analysis",
        "Statistical Analysis Plan", "Insurance/Indemnity Certificate",
        "Regulatory approval from country of origin (if applicable)", "Manufacturing quality data",
        "Proposed label/package insert",
    ],
    "New Drug Application": [
        "Form 44 (Application)", "Summary of Dossier (CTD format)", "Module 1 - Administrative",
        "Module 2 - Summaries", "Module 3 - Quality", "Module 4 - Non-clinical",
        "Module 5 - Clinical", "Free Sale Certificate / CoPP", "GMP Certificate",
        "Pharmacovigilance Plan", "Risk Management Plan", "Proposed prescribing information",
        "Bioequivalence data (if generic)", "Paediatric Investigation Plan",
    ],
    "SAE Report": [
        "Patient demographics", "Reporter information", "Drug/device details",
        "Event description", "Onset date", "Outcome", "Causality assessment",
        "Dechallenge/rechallenge information", "Concomitant medications",
        "Medical history", "Narrative", "Follow-up status",
    ],
}
