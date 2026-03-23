"""Shared models for signal persistence and API responses."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SignalCreate(BaseModel):
    """Insert payload (no database id)."""

    asset: str
    timestamp: int
    signal: Literal["BUY", "SELL", "HOLD"]
    confidence: float = Field(ge=0.0, le=1.0)
    anomaly: bool
    price: float | None = None
    volume: int | None = None


class SignalRow(BaseModel):
    """Stored row including id (API / query result)."""

    id: int
    asset: str
    timestamp: int
    signal: Literal["BUY", "SELL", "HOLD"]
    confidence: float
    anomaly: bool
    price: float | None = None
    volume: int | None = None


class SignalFilters(BaseModel):
    """Query filters (all optional)."""

    asset: str | None = None
    signal: str | None = None
    anomaly: bool | None = None
    from_ts: int | None = None
    to_ts: int | None = None
