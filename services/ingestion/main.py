"""
Ingestion: mock or Massive-driven ticks → Redis stream `market_data`.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from mock_data import event_from_block_hash, mock_market_events
from massive_stream import subscribe_new_heads
from redis_publisher import DEFAULT_STREAM, MarketDataPublisher

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool = True) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.lower() in ("1", "true", "yes", "on")


def _setup_logging() -> None:
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
    )


async def _run_mock(publisher: MarketDataPublisher) -> None:
    async for event in mock_market_events():
        await publisher.publish(event)
        logger.info(
            "mock asset=%s price=%s",
            event["asset"],
            event["price"],
        )


async def _run_real(publisher: MarketDataPublisher) -> None:
    wss = os.environ.get(
        "MASSIVE_WSS_URL",
        "wss://ethereum-rpc.publicnode.com",
    )

    async def on_block(block_hash: str) -> None:
        event = event_from_block_hash(block_hash)
        await publisher.publish(event)
        logger.info(
            "block hash=%s asset=%s price=%s",
            block_hash[:12] + "...",
            event["asset"],
            event["price"],
        )

    await subscribe_new_heads(wss, on_block)


async def _async_main() -> None:
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    stream = os.environ.get("REDIS_STREAM", DEFAULT_STREAM)
    use_mock = _env_bool("USE_MOCK", default=True)

    publisher = MarketDataPublisher(redis_url, stream=stream)
    await publisher.connect()

    try:
        if use_mock:
            logger.info("Mode=mock (USE_MOCK=true)")
            await _run_mock(publisher)
        else:
            logger.info("Mode=real Massive WebSocket (USE_MOCK=false)")
            await _run_real(publisher)
    finally:
        await publisher.aclose()


def main() -> None:
    _setup_logging()
    try:
        asyncio.run(_async_main())
    except KeyboardInterrupt:
        logger.info("Shutdown requested")


if __name__ == "__main__":
    main()
