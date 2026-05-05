"""
PostgreSQL database layer using SQLAlchemy.

Tables:
  processing_jobs  — audit log of every document processed
  token_registry   — pseudonymisation token → AES-encrypted original value
                     (reversible by authorised personnel, never stored as plaintext)
  document_results — persists AI output JSON for each processing run
  s3_artifacts     — tracks S3 object keys

To start PostgreSQL (Docker):
  sudo docker start cdsco_db
  # or first time:
  sudo docker run -d --name cdsco_db \
    -e POSTGRES_USER=cdsco -e POSTGRES_PASSWORD=cdsco123 \
    -e POSTGRES_DB=cdsco_regai -p 5432:5432 postgres:16-alpine
"""
import os
import uuid
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any, List

from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime,
    ForeignKey, JSON, text, UniqueConstraint
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy.exc import OperationalError

Base = declarative_base()


# ── ORM Models ──────────────────────────────────────────────────────────────

class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    job_id      = Column(String(64), unique=True, nullable=False)
    module      = Column(String(64), nullable=False)
    doc_type    = Column(String(128))
    filename    = Column(String(256))
    file_size   = Column(Integer)
    status      = Column(String(32), default="completed")
    created_at  = Column(DateTime, default=datetime.utcnow)
    duration_ms = Column(Integer)
    error_msg   = Column(Text)


class TokenRegistry(Base):
    """
    Each row maps one pseudonymisation token to its AES-encrypted original value.
    An authorised officer can call /api/anonymize/reverse/{token} to retrieve
    the plaintext. The encryption key lives in .env (TOKEN_ENCRYPTION_KEY) and
    should be rotated through a key-management procedure.

    Tokens like [PERSON_001] repeat across documents, so uniqueness is enforced
    per (job_id, token) — not on token alone.
    """
    __tablename__ = "token_registry"
    __table_args__ = (UniqueConstraint("job_id", "token", name="uq_token_per_job"),)

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    job_id             = Column(String(64), ForeignKey("processing_jobs.job_id"), nullable=False)
    token              = Column(String(256), nullable=False, index=True)
    entity_type        = Column(String(64))
    original_encrypted = Column(Text, nullable=False)   # Fernet(AES-128-CBC) ciphertext
    created_at         = Column(DateTime, default=datetime.utcnow)


class DocumentResult(Base):
    __tablename__ = "document_results"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    job_id     = Column(String(64), ForeignKey("processing_jobs.job_id"), nullable=False)
    module     = Column(String(64))
    result     = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)


class S3Artifact(Base):
    __tablename__ = "s3_artifacts"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    job_id        = Column(String(64), ForeignKey("processing_jobs.job_id"), nullable=False)
    bucket        = Column(String(128))
    key           = Column(String(512), nullable=False)
    artifact_type = Column(String(64))
    size_bytes    = Column(Integer)
    created_at    = Column(DateTime, default=datetime.utcnow)


# ── Encryption helpers ───────────────────────────────────────────────────────

def _get_fernet():
    """Return a Fernet instance using TOKEN_ENCRYPTION_KEY from env."""
    from cryptography.fernet import Fernet
    key = os.getenv("TOKEN_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY not set in .env")
    return Fernet(key.encode())


def _encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def _decrypt(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()


# ── Engine & session management ──────────────────────────────────────────────

_engine = None
_SessionLocal = None


def init_db(connection_string: str) -> bool:
    """Initialise engine, create tables, verify connection. Returns True if OK."""
    global _engine, _SessionLocal
    try:
        _engine = create_engine(connection_string, pool_pre_ping=True, pool_size=5)
        Base.metadata.create_all(_engine)
        _SessionLocal = sessionmaker(bind=_engine)
        with _engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def get_session() -> Optional[Session]:
    if _SessionLocal is None:
        return None
    return _SessionLocal()


def is_connected() -> bool:
    if _engine is None:
        return False
    try:
        with _engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


# ── Write helpers ────────────────────────────────────────────────────────────

def log_job(module: str, doc_type: str = "", filename: str = "",
            file_size: int = 0, status: str = "completed",
            duration_ms: int = 0, error_msg: str = "") -> str:
    """Create a ProcessingJob audit record. Returns job_id (always)."""
    job_id = uuid.uuid4().hex[:16]
    session = get_session()
    if session is None:
        return job_id
    try:
        session.add(ProcessingJob(
            job_id=job_id, module=module, doc_type=doc_type,
            filename=filename, file_size=file_size, status=status,
            duration_ms=duration_ms, error_msg=error_msg,
        ))
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()
    return job_id


def save_tokens(job_id: str, matches: List[Dict]) -> None:
    """
    Encrypt each original PII value with Fernet and store against its token.
    This makes reversal possible: decrypt_token(token) returns the original.
    """
    session = get_session()
    if session is None:
        return
    try:
        for m in matches:
            original = m.get("value", "")
            token = m.get("token", "")
            if not token or not original:
                continue
            try:
                encrypted = _encrypt(original)
            except Exception:
                continue
            # Upsert — skip if this (job_id, token) pair is already stored
            existing = session.query(TokenRegistry).filter_by(job_id=job_id, token=token).first()
            if existing:
                continue
            session.add(TokenRegistry(
                job_id=job_id,
                token=token,
                entity_type=m.get("category", m.get("entity_type", "UNKNOWN")),
                original_encrypted=encrypted,
            ))
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


def decrypt_token(token: str, job_id: Optional[str] = None) -> Optional[str]:
    """
    Reverse a pseudonymisation token → original value.
    If job_id is provided, scopes lookup to that job. Otherwise returns the
    most recent match (tokens like [PERSON_001] repeat across documents).
    Returns None if token not found or decryption fails.
    """
    session = get_session()
    if session is None:
        return None
    try:
        q = session.query(TokenRegistry).filter(TokenRegistry.token == token)
        if job_id:
            q = q.filter(TokenRegistry.job_id == job_id)
        else:
            q = q.order_by(TokenRegistry.created_at.desc())
        row = q.first()
        if row is None:
            return None
        return _decrypt(row.original_encrypted)
    except Exception:
        return None
    finally:
        session.close()


def save_result(job_id: str, module: str, result: Dict) -> None:
    session = get_session()
    if session is None:
        return
    try:
        session.add(DocumentResult(job_id=job_id, module=module, result=result))
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


def save_s3_artifact(job_id: str, bucket: str, key: str,
                     artifact_type: str, size_bytes: int = 0) -> None:
    session = get_session()
    if session is None:
        return
    try:
        session.add(S3Artifact(
            job_id=job_id, bucket=bucket, key=key,
            artifact_type=artifact_type, size_bytes=size_bytes,
        ))
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


# ── Read helpers ─────────────────────────────────────────────────────────────

def recent_jobs(limit: int = 50) -> List[Dict]:
    session = get_session()
    if session is None:
        return []
    try:
        rows = (
            session.query(ProcessingJob)
            .order_by(ProcessingJob.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "job_id": r.job_id,
                "module": r.module,
                "doc_type": r.doc_type or "",
                "filename": r.filename or "",
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else "",
                "duration_ms": r.duration_ms or 0,
            }
            for r in rows
        ]
    except Exception:
        return []
    finally:
        session.close()


def token_jobs(limit: int = 100) -> List[Dict]:
    """Return recent token registry entries for audit (no plaintext exposed)."""
    session = get_session()
    if session is None:
        return []
    try:
        rows = (
            session.query(TokenRegistry)
            .order_by(TokenRegistry.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "token": r.token,
                "entity_type": r.entity_type,
                "job_id": r.job_id,
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in rows
        ]
    except Exception:
        return []
    finally:
        session.close()
