"""Rule-based trading signal logic when USE_GROQ=false."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class InferInput(BaseModel):
    asset: str
    price: float
    volume: float
    whale_trade: bool
    trend: str = Field(description='Expected: "UP", "DOWN", or "NEUTRAL"')


class InferOutput(BaseModel):
    signal: Literal["BUY", "SELL", "HOLD"]
    confidence: float
    anomaly: bool
    summary: str


def _norm_trend(trend: str) -> str:
    t = trend.strip().upper()
    if t in ("UP", "DOWN", "NEUTRAL"):
        return t
    return "NEUTRAL"


def rule_based_infer(inp: InferInput) -> InferOutput:
    """
    Mock rules:
    - whale_trade + UP → BUY
    - whale_trade + DOWN → SELL
    - otherwise → HOLD
    """
    trend = _norm_trend(inp.trend)
    anomaly = bool(inp.whale_trade)

    if inp.whale_trade and trend == "UP":
        return InferOutput(
            signal="BUY",
            confidence=0.82,
            anomaly=anomaly,
            summary=(
                f"Whale activity on {inp.asset} with upward momentum; "
                f"price {inp.price}, volume {inp.volume}."
            ),
        )
    if inp.whale_trade and trend == "DOWN":
        return InferOutput(
            signal="SELL",
            confidence=0.82,
            anomaly=anomaly,
            summary=(
                f"Whale activity on {inp.asset} with downward pressure; "
                f"price {inp.price}, volume {inp.volume}."
            ),
        )

    return InferOutput(
        signal="HOLD",
        confidence=0.55,
        anomaly=anomaly,
        summary=(
            f"No whale+trend trigger for {inp.asset}; "
            f"trend={trend}, price={inp.price}."
        ),
    )
