"""
Gemini wrapper with:
- Exponential-backoff retry (3 attempts)
- response_mime_type enforcement (JSON)
- Global regulatory system instruction
- JSON fence stripping
- Graceful fallback dict on failure
"""
import json
import time
import re
import logging

log = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = (
    "You are a CDSCO regulatory AI assistant specialising in Indian pharmaceutical "
    "and clinical trial compliance. Strict rules: "
    "(1) Do NOT hallucinate or infer — only extract what is explicitly in the input. "
    "(2) Return null or empty list/string when information is absent. "
    "(3) ALWAYS return valid JSON — no markdown fences, no extra fields. "
    "(4) Preserve factual accuracy over completeness. "
    "(5) Follow DPDP Act 2023, NDHM, ICMR, and CDSCO guidelines."
)


def call_gemini(client, model_name: str, prompt: str, fallback: dict | list = None) -> dict | list:
    """
    Call Gemini with retry + JSON enforcement.
    Returns parsed dict/list, or fallback on total failure.
    """
    if fallback is None:
        fallback = {}

    from google.genai import types

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        temperature=0.2,
        top_p=0.8,
        response_mime_type="application/json",
    )

    last_error = None
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config,
            )
            raw = response.text.strip()
            # Strip any markdown fences the model still adds
            raw = re.sub(r"^```(?:json)?", "", raw).rstrip("`").strip()
            return json.loads(raw)
        except json.JSONDecodeError as e:
            last_error = e
            # Ask model to fix its own output
            prompt = f"The previous response was not valid JSON. Fix and return valid JSON only:\n{raw}"
            time.sleep(2 ** attempt)
        except Exception as e:
            last_error = e
            time.sleep(2 ** attempt)

    log.warning("Gemini call failed after 3 attempts: %s", last_error)
    return fallback
