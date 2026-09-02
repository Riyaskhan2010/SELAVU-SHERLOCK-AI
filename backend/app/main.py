import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import create_tables
from app.routers import auth, datasets, analysis, findings, ai_chat, connectors, demo, assistant

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting CostLens API...")
    create_tables()
    logger.info(f"LLM provider: {settings.LLM_PROVIDER}")

    # Pre-build demo cache so first user request is instant
    try:
        from app.routers.demo import _get_or_build_demo
        _get_or_build_demo()
        logger.info("Demo dataset cache ready")
    except Exception as e:
        logger.warning(f"Demo dataset pre-build failed (non-fatal): {e}")

    yield
    logger.info("Shutting down CostLens API")


app = FastAPI(
    title="CostLens API",
    description="AI-powered cloud cost optimization platform",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
PREFIX = "/api"
app.include_router(auth.router, prefix=PREFIX)
app.include_router(datasets.router, prefix=PREFIX)
app.include_router(analysis.router, prefix=PREFIX)
app.include_router(findings.router, prefix=PREFIX)
app.include_router(findings.anomaly_router, prefix=PREFIX)
app.include_router(ai_chat.router, prefix=PREFIX)
app.include_router(connectors.router, prefix=PREFIX)
app.include_router(demo.router, prefix=PREFIX)
app.include_router(assistant.router, prefix=PREFIX)


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/")
def root():
    return {"message": "CostLens API", "docs": "/docs"}
