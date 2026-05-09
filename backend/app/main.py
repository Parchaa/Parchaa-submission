"""FastAPI backend for CDSCO RegAI."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api import upload, anonymize, summarize, classify, compare, report, health, history


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise PostgreSQL on startup
    try:
        from database import init_db
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))
        db_url = os.getenv("DATABASE_URL", "")
        if db_url:
            ok = init_db(db_url)
            print(f"[DB] {'Connected' if ok else 'Failed to connect'} — {db_url.split('@')[-1]}")
        else:
            print("[DB] DATABASE_URL not set — running without persistence")
    except Exception as e:
        print(f"[DB] Startup error: {e}")
    yield


app = FastAPI(
    title="CDSCO RegAI API",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router,    prefix="/api")
app.include_router(upload.router,    prefix="/api")
app.include_router(anonymize.router, prefix="/api")
app.include_router(summarize.router, prefix="/api")
app.include_router(classify.router,  prefix="/api")
app.include_router(compare.router,   prefix="/api")
app.include_router(report.router,    prefix="/api")
app.include_router(history.router,   prefix="/api")
