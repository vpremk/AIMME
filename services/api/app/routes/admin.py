"""
Local-dev stubs for UserManagement admin routes (parity with AWS Lambda + API Gateway).

Production uses GET/POST /admin/users and POST /admin/users/login on API Gateway.
This FastAPI service has no DynamoDB; list returns empty and login bump is a no-op.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/admin", tags=["admin"])


class LoginBumpBody(BaseModel):
    userId: str = ""


@router.get("/users")
async def list_users(limit: int = 50) -> dict:
    _ = max(1, min(limit, 200))
    return {"items": [], "count": 0}


@router.post("/users/login")
async def bump_login(body: LoginBumpBody | None = None) -> dict:
    uid = (body.userId if body else "") or ""
    return {"status": "ok", "userId": uid}


@router.get("/ops")
async def ops_snapshot() -> dict:
    return {
        "totalRows": 0,
        "rawRows": 0,
        "signalRows": 0,
        "rawMissingUserOrConsent": 0,
    }
