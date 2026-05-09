import time
from fastapi import APIRouter
from pydantic import BaseModel, field_validator
from app.deps import get_ai
from modules.summarizer import summarise_document, chat_with_document, PROMPTS, _SUGAM_SUBTYPE_CONTEXT
from utils.file_handler import truncate

router = APIRouter()

SUGAM_SUBTYPES = list(_SUGAM_SUBTYPE_CONTEXT.keys())


class SummarizeRequest(BaseModel):
    text: str
    document_type: str = "SUGAM Application"
    sub_type: str = ""
    filename: str = ""

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("text must not be empty")
        return v

    @field_validator("document_type")
    @classmethod
    def doc_type_valid(cls, v):
        if v not in PROMPTS:
            raise ValueError(f"document_type must be one of: {', '.join(PROMPTS)}")
        return v

    @field_validator("sub_type")
    @classmethod
    def sub_type_valid(cls, v):
        if v and v not in SUGAM_SUBTYPES:
            raise ValueError(f"sub_type must be one of: {', '.join(SUGAM_SUBTYPES)}")
        return v


@router.post("/summarize")
def summarize(req: SummarizeRequest):
    t0 = time.time()
    client, model = get_ai()
    result = summarise_document(
        truncate(req.text), req.document_type, client, model, sub_type=req.sub_type
    )
    try:
        from database import log_job, save_result
        job_id = log_job(
            module="summarisation",
            doc_type=req.document_type,
            filename=req.filename,
            duration_ms=int((time.time() - t0) * 1000),
        )
        save_result(job_id, "summarisation", result)
    except Exception:
        pass
    return result


@router.get("/summarize/subtypes")
def get_subtypes():
    """Return available SUGAM sub-types for the frontend dropdown."""
    return {"subtypes": SUGAM_SUBTYPES}

class ChatRequest(BaseModel):
    text: str
    question: str

    @field_validator("text", "question")
    @classmethod
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("field must not be empty")
        return v

@router.post("/summarize/chat")
def summarize_chat(req: ChatRequest):
    client, model = get_ai()
    result = chat_with_document(truncate(req.text), req.question, client, model)
    return result
