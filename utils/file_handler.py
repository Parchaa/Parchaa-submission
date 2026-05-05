"""
Document extraction using best-available library per format:
  PDF  → PyMuPDF (text layer) → pdfplumber (fallback) → OCR (last resort)
  DOCX → mammoth (preserves structure)
  CSV/XLSX → pandas
  TXT  → direct decode
"""
import io
import re
import unicodedata

import pandas as pd


def extract_text_from_file(uploaded_file) -> str:
    name = uploaded_file.name.lower()
    raw = uploaded_file.read()
    uploaded_file.seek(0)

    if name.endswith(".pdf"):
        return _extract_pdf(raw)
    elif name.endswith(".docx"):
        return _extract_docx(raw)
    elif name.endswith(".txt"):
        return _clean(raw.decode("utf-8", errors="ignore"))
    elif name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(raw)).to_string(index=False)
    elif name.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(raw)).to_string(index=False)
    else:
        return _clean(raw.decode("utf-8", errors="ignore"))


def _extract_pdf(raw: bytes) -> str:
    # Try PyMuPDF first (richer, handles text layers well)
    try:
        import fitz
        doc = fitz.open(stream=raw, filetype="pdf")
        pages = [page.get_text("text") for page in doc]
        text = "\n\n".join(pages)
        if len(text.strip()) > 100:
            return _clean(text)
    except Exception:
        pass

    # Fallback: pdfplumber
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            pages = [p.extract_text() or "" for p in pdf.pages]
        text = "\n\n".join(pages)
        if len(text.strip()) > 50:
            return _clean(text)
    except Exception:
        pass

    # Last resort: pdfminer
    try:
        from pdfminer.high_level import extract_text as pdfminer_extract
        return _clean(pdfminer_extract(io.BytesIO(raw)))
    except Exception:
        return ""


def _extract_docx(raw: bytes) -> str:
    # mammoth preserves headings, tables, lists as plain text
    try:
        import mammoth
        result = mammoth.extract_raw_text(io.BytesIO(raw))
        return _clean(result.value)
    except Exception:
        pass
    # Fallback: python-docx
    try:
        from docx import Document
        doc = Document(io.BytesIO(raw))
        return _clean("\n".join(p.text for p in doc.paragraphs))
    except Exception:
        return ""


def _clean(text: str) -> str:
    """Normalise OCR/extraction artefacts."""
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)  # control chars
    text = re.sub(r" {2,}", " ", text)          # multiple spaces
    text = re.sub(r"-\n([a-z])", r"\1", text)  # broken hyphenation
    text = re.sub(r"\n{3,}", "\n\n", text)      # excessive newlines
    return text.strip()


def read_as_dataframe(uploaded_file):
    name = uploaded_file.name.lower()
    raw = uploaded_file.read()
    uploaded_file.seek(0)
    if name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(raw))
    elif name.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(raw))
    return None


def truncate(text: str, max_chars: int = 150000) -> str:
    if len(text) > max_chars:
        return text[:max_chars] + "\n\n[... truncated ...]"
    return text
