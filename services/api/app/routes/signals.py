"""Read-only signal listing with pagination and filters."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.storage import SignalStore
from app.storage.models import SignalCreate, SignalFilters, SignalRow

router = APIRouter(tags=["signals"])

_VALID_SIGNAL = frozenset({"BUY", "SELL", "HOLD"})


class PaginatedSignals(BaseModel):
    items: list[SignalRow]
    total: int
    limit: int
    offset: int


def _get_store(request: Request) -> SignalStore:
    return request.app.state.signal_store


def _parse_signal_filter(
    value: str | None,
) -> Literal["BUY", "SELL", "HOLD"] | None:
    if value is None:
        return None
    u = value.strip().upper()
    if u not in _VALID_SIGNAL:
        raise HTTPException(
            status_code=400,
            detail="signal filter must be BUY, SELL, or HOLD",
        )
    return u  # type: ignore[return-value]


async def _paginated(
    store: SignalStore,
    filters: SignalFilters,
    *,
    limit: int,
    offset: int,
) -> PaginatedSignals:
    page = await store.query(filters, limit=limit, offset=offset)
    return PaginatedSignals(
        items=page.items,
        total=page.total,
        limit=limit,
        offset=offset,
    )


@router.post("/signals", response_model=SignalRow, status_code=201)
async def create_signal(request: Request, body: SignalCreate) -> SignalRow:
    """Persist a trading signal (used by the processor pipeline)."""
    store = _get_store(request)
    rid = await store.insert(body)
    return SignalRow(
        id=rid,
        asset=body.asset,
        timestamp=body.timestamp,
        signal=body.signal,
        confidence=body.confidence,
        anomaly=body.anomaly,
    )


@router.get("/signals", response_model=PaginatedSignals)
async def list_signals(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=500, description="Page size")] = 20,
    offset: Annotated[int, Query(ge=0, description="Offset for pagination")] = 0,
    asset: Annotated[
        str | None,
        Query(description="Exact match on asset symbol"),
    ] = None,
    signal: Annotated[
        str | None,
        Query(description="Filter by signal: BUY, SELL, or HOLD"),
    ] = None,
    anomaly: Annotated[
        bool | None,
        Query(description="Filter by anomaly flag"),
    ] = None,
    from_ts: Annotated[
        int | None,
        Query(description="Include rows with timestamp >= from_ts (unix)"),
    ] = None,
    to_ts: Annotated[
        int | None,
        Query(description="Include rows with timestamp <= to_ts (unix)"),
    ] = None,
) -> PaginatedSignals:
    """List stored signals with optional filters and pagination."""
    store = _get_store(request)
    sf = _parse_signal_filter(signal)
    filters = SignalFilters(
        asset=asset,
        signal=sf,
        anomaly=anomaly,
        from_ts=from_ts,
        to_ts=to_ts,
    )
    return await _paginated(store, filters, limit=limit, offset=offset)


@router.get("/signals/{asset}", response_model=PaginatedSignals)
async def list_signals_for_asset(
    request: Request,
    asset: str,
    limit: Annotated[int, Query(ge=1, le=500)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    signal: Annotated[str | None, Query()] = None,
    anomaly: Annotated[bool | None, Query()] = None,
    from_ts: Annotated[int | None, Query()] = None,
    to_ts: Annotated[int | None, Query()] = None,
) -> PaginatedSignals:
    """Signals for a single asset (path); same filters as /signals minus `asset` query."""
    store = _get_store(request)
    sf = _parse_signal_filter(signal)
    filters = SignalFilters(
        asset=asset,
        signal=sf,
        anomaly=anomaly,
        from_ts=from_ts,
        to_ts=to_ts,
    )
    return await _paginated(store, filters, limit=limit, offset=offset)


@router.get("/anomalies", response_model=PaginatedSignals)
async def list_anomalies(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=500)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    asset: Annotated[str | None, Query(description="Restrict to one asset")] = None,
    signal: Annotated[str | None, Query()] = None,
    from_ts: Annotated[int | None, Query()] = None,
    to_ts: Annotated[int | None, Query()] = None,
) -> PaginatedSignals:
    """Rows where anomaly is true, with optional filters and pagination."""
    store = _get_store(request)
    sf = _parse_signal_filter(signal)
    filters = SignalFilters(
        asset=asset,
        signal=sf,
        anomaly=True,
        from_ts=from_ts,
        to_ts=to_ts,
    )
    return await _paginated(store, filters, limit=limit, offset=offset)
