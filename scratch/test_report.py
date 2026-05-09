import os
import sys
sys.path.append('/home/ubuntu/cdsco_app')

from modules.inspection_report import generate_inspection_report
from utils.gemini_client import call_gemini
from google.genai import Client

def test_report():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not found")
        return

    client = Client(api_key=api_key)
    # Get model from .env
    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    print(f"Using model: {model}")
    
    sample_text = """
    GCP Inspection at Apollo Hospital, Chennai on 12-Feb-2024.
    Inspectors: Dr. A. Kumar, CDSCO.
    Observations:
    - Informed consent form for subject IN-001-001 was missing the investigator signature.
    - Investigational product storage temp was 8C (limit 2-8C), but logger showed 10C for 2 hours.
    - SAE reporting for subject IN-001-005 was delayed by 4 days.
    """
    
    print("Generating report...")
    try:
        result = generate_inspection_report(sample_text, "GCP Inspection", client, model)
        import json
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    test_report()
