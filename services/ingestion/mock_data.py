"""Random Polygon-style market events for local simulation."""

from __future__ import annotations

import asyncio
import random
import secrets
import time
from typing import Any, AsyncIterator

_ASSETS = ("AAPLx", "GOOGLx", "MSFTx", "NVDAx", "METAx")


def _random_wallet() -> str:
    return "0x" + secrets.token_hex(20)


def make_market_event(
    *,
    asset: str | None = None,
    price: float | None = None,
    volume: float | None = None,
    wallet: str | None = None,
    timestamp: int | None = None,
) -> dict[str, Any]:
    """Build one event matching the platform schema."""
    return {
        "asset": asset or random.choice(_ASSETS),
        "price": price if price is not None else round(random.uniform(50.0, 500.0), 4),
        "volume": volume if volume is not None else round(random.uniform(100.0, 2_000_000.0), 2),
        "wallet": wallet or _random_wallet(),
        "timestamp": timestamp if timestamp is not None else int(time.time()),
    }


def event_from_block_hash(block_hash: str) -> dict[str, Any]:
    """Derive a deterministic-ish market row from a block hash (real RPC mode)."""
    h = block_hash.lower().removeprefix("0x")
    seed = int(h[:16], 16) if len(h) >= 16 else hash(block_hash) % (2**32)
    rng = random.Random(seed)
    wallet_hex = (h + h)[:40]
    return {
        "asset": _ASSETS[seed % len(_ASSETS)],
        "price": round(rng.uniform(50.0, 500.0), 4),
        "volume": round(rng.uniform(100.0, 2_000_000.0), 2),
        "wallet": "0x" + wallet_hex,
        "timestamp": int(time.time()),
    }


async def mock_market_events() -> AsyncIterator[dict[str, Any]]:
    """Emit mock events every 1–2 seconds (async generator)."""
    while True:
        await asyncio.sleep(random.uniform(1.0, 2.0))
        yield make_market_event()
