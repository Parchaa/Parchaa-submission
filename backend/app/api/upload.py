import io
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.deps import get_ai

router = APIRouter()

# Audio MIME types supported by Gemini multimodal
_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".webm", ".aac", ".flac", ".mp4"}
_AUDIO_MIME = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".mp4": "audio/mp4",
}

# Image MIME types supported by Gemini Vision
_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp", ".heic", ".heif"}
_IMAGE_MIME = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".tiff": "image/tiff", ".tif": "image/tiff",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".heic": "image/heic", ".heif": "image/heic",
}


class _FakeUpload:
    """Adapts FastAPI UploadFile to our file_handler interface."""
    def __init__(self, name: str, data: bytes):
        self.name = name
        self._buf = io.BytesIO(data)
    def read(self): return self._buf.read()
    def seek(self, pos): self._buf.seek(pos)


def _transcribe_audio(client, model_name: str, raw: bytes, mime_type: str) -> str:
    """Use Gemini to transcribe audio to text."""
    from google.genai import types as gtypes
    response = client.models.generate_content(
        model=model_name,
        contents=[
            gtypes.Part.from_bytes(data=raw, mime_type=mime_type),
            (
                "Transcribe this audio recording verbatim. "
                "Include all spoken content. "
                "If multiple speakers are distinguishable, label them as Speaker 1:, Speaker 2:, etc. "
                "Mark unclear sections as [inaudible]. "
                "Return the full transcript as plain text only — no commentary, no summary."
            ),
        ],
        config=gtypes.GenerateContentConfig(temperature=0.1),
    )
    return response.text.strip()


def _ocr_image(client, model_name: str, raw: bytes, mime_type: str) -> str:
    """Use Gemini Vision to extract text from images including handwritten notes."""
    from google.genai import types as gtypes
    response = client.models.generate_content(
        model=model_name,
        contents=[
            gtypes.Part.from_bytes(data=raw, mime_type=mime_type),
            (
                "Extract all text visible in this image. "
                "If it contains handwritten content, transcribe it faithfully preserving the original wording. "
                "Preserve structure: headings, numbered/bulleted lists, tables (as tab-separated), and paragraph breaks. "
                "If the image contains a form or inspection checklist, preserve the field labels and values. "
                "Return only the extracted text — no commentary, no interpretation."
            ),
        ],
        config=gtypes.GenerateContentConfig(temperature=0.1),
    )
    return response.text.strip()


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if file.size and file.size > 50 * 1024 * 1024:
        raise HTTPException(413, "File exceeds 50 MB limit")

    raw = await file.read()
    filename = file.filename or ""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # ── Audio: transcribe via Gemini ──────────────────────────────────────
    if ext in _AUDIO_EXTENSIONS:
        mime = _AUDIO_MIME.get(ext, "audio/mpeg")
        try:
            client, model = get_ai()
            text = _transcribe_audio(client, model, raw, mime)
        except Exception as e:
            raise HTTPException(422, f"Audio transcription failed: {e}")
        return {
            "filename": filename,
            "text": text,
            "text_length": len(text),
            "source": "audio_transcription",
        }

    # ── Image: OCR via Gemini Vision ──────────────────────────────────────
    if ext in _IMAGE_EXTENSIONS:
        mime = _IMAGE_MIME.get(ext, "image/jpeg")
        try:
            client, model = get_ai()
            text = _ocr_image(client, model, raw, mime)
        except Exception as e:
            raise HTTPException(422, f"Image OCR failed: {e}")
        return {
            "filename": filename,
            "text": text,
            "text_length": len(text),
            "source": "image_ocr",
        }

    # ── Documents: existing text extraction ──────────────────────────────
    from utils.file_handler import extract_text_from_file
    fake = _FakeUpload(filename, raw)
    text = extract_text_from_file(fake)
    return {
        "filename": filename,
        "text": text,
        "text_length": len(text),
        "source": "text_extraction",
    }
