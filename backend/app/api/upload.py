import io
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()

class _FakeUpload:
    """Adapts FastAPI UploadFile to our file_handler interface."""
    def __init__(self, name: str, data: bytes):
        self.name = name
        self._buf = io.BytesIO(data)
    def read(self): return self._buf.read()
    def seek(self, pos): self._buf.seek(pos)

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if file.size and file.size > 50 * 1024 * 1024:
        raise HTTPException(413, "File exceeds 50 MB limit")
    raw = await file.read()
    from utils.file_handler import extract_text_from_file
    fake = _FakeUpload(file.filename, raw)
    text = extract_text_from_file(fake)
    return {
        "filename": file.filename,
        "text": text,
        "text_length": len(text),
    }
