"""
AI inference service: rule-based mock or Groq chat completions.
"""

from __future__ import annotations

import logging
import os
import sys

from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from groq_client import infer_with_groq
from mock_inference import InferInput, rule_based_infer
from shared.alert_publisher import publish_alert

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AIMME AI Service",
    description="Trading signal inference (mock rules or Groq)",
    version="0.1.0",
)


class InferRequest(BaseModel):
    asset: str
    price: float
    volume: float
    whale_trade: bool
    trend: str = Field(
        ...,
        description='Market trend: "UP", "DOWN", or "NEUTRAL"',
    )


class InferResponse(BaseModel):
    signal: Literal["BUY", "SELL", "HOLD"]
    confidence: float = Field(..., ge=0.0, le=1.0)
    anomaly: bool
    summary: str


def _use_groq() -> bool:
    return os.environ.get("USE_GROQ", "false").lower() in ("1", "true", "yes", "on")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/infer", response_model=InferResponse)
async def infer(body: InferRequest) -> InferResponse:
    inp = InferInput(
        asset=body.asset,
        price=body.price,
        volume=body.volume,
        whale_trade=body.whale_trade,
        trend=body.trend,
    )

    if _use_groq():
        try:
            out = await infer_with_groq(inp)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Groq inference failed")
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    else:
        out = rule_based_infer(inp)

    resp = InferResponse(
        signal=out.signal,
        confidence=out.confidence,
        anomaly=out.anomaly,
        summary=out.summary,
    )

    if resp.anomaly:
        await publish_alert(
            {
                "event": "anomaly_detected",
                "source": "ai_service",
                "asset": body.asset,
                "price": body.price,
                "volume": body.volume,
                "whale_trade": body.whale_trade,
                "trend": body.trend,
                "signal": resp.signal,
                "confidence": resp.confidence,
                "summary": resp.summary,
            }
        )

    return resp
