"""Publish market events to Redis Streams."""

from __future__ import annotations

import json
import logging
from typing import Any

from redis.asyncio import Redis

logger = logging.getLogger(__name__)

DEFAULT_STREAM = "market_data"


def _encode_event(event: dict[str, Any]) -> dict[str, str]:
    """Store as a single JSON payload plus flat fields for convenience."""
    flat = {
        "asset": str(event["asset"]),
        "price": str(event["price"]),
        "volume": str(event["volume"]),
        "wallet": str(event["wallet"]),
        "timestamp": str(int(event["timestamp"])),
        "payload": json.dumps(event, separators=(",", ":")),
    }
    return flat


class MarketDataPublisher:
    def __init__(
        self,
        redis_url: str,
        stream: str = DEFAULT_STREAM,
        *,
        maxlen: int | None = 50_000,
    ) -> None:
        self._redis_url = redis_url
        self._stream = stream
        self._maxlen = maxlen
        self._client: Redis | None = None

    async def connect(self) -> None:
        if self._client is not None:
            return
        self._client = Redis.from_url(self._redis_url, decode_responses=True)
        await self._client.ping()
        logger.info("Connected to Redis for stream %s", self._stream)

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def publish(self, event: dict[str, Any]) -> str:
        if self._client is None:
            raise RuntimeError("publisher not connected")
        fields = _encode_event(event)
        entry_id = await self._client.xadd(
            self._stream,
            fields,
            maxlen=self._maxlen,
            approximate=True,
        )
        logger.debug("XADD %s %s", self._stream, entry_id)
        return str(entry_id)
