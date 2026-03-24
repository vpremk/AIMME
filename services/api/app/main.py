import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.admin import router as admin_router
from app.routes.signals import router as signals_router
from app.storage import create_signal_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = await create_signal_store()
    app.state.signal_store = store
    yield
    await store.close()


app = FastAPI(
    title="AIMME API",
    description="Real-time AI capital markets platform — API gateway",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(signals_router)
app.include_router(admin_router)

# Any port on loopback (covers Next.js on 3000/3001, etc.). For LAN UI, set CORS_ALLOW_LAN=1.
_cors_lan = os.environ.get("CORS_ALLOW_LAN", "").lower() in ("1", "true", "yes")
_origin_regex = (
    r"http://(localhost|127\.0\.0\.1)(:\d+)?"
    if not _cors_lan
    else r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?"
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "aimme-api", "docs": "/docs"}


def _redis_url() -> str:
    return os.environ.get("REDIS_URL", "redis://localhost:6379/0")


@app.get("/ready")
async def ready() -> dict[str, str | bool]:
    """Liveness includes Redis when REDIS_URL is set (compose)."""
    url = _redis_url()
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(url, decode_responses=True)
        await client.ping()
        await client.aclose()
        return {"ready": True, "redis": "connected"}
    except Exception as exc:  # noqa: BLE001 — readiness probe
        return {"ready": False, "redis": f"error: {exc!s}"}
