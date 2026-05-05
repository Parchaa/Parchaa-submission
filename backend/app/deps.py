"""Shared dependency: Gemini client + model name."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from config import get_client, get_model, GEMINI_API_KEY
from fastapi import HTTPException

def get_ai():
    if not GEMINI_API_KEY:
        raise HTTPException(503, detail="GEMINI_API_KEY not configured — add it to .env and restart the server")
    client = get_client()
    if client is None:
        raise HTTPException(503, detail="AI client failed to initialise — check GEMINI_API_KEY validity")
    return client, get_model()
