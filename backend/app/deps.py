"""Shared dependency: Gemini client + model name."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from config import get_client, get_model, GEMINI_API_KEY
from fastapi import HTTPException

def get_ai():
    if not GEMINI_API_KEY:
        raise HTTPException(503, "GEMINI_API_KEY not set in .env")
    return get_client(), get_model()
