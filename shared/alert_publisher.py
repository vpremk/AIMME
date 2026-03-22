"""Publish anomaly alerts: structured log + Redis PUB/SUB."""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import redis.asyncio as redis

logger = logging.getLogger(__name__)
alert_logger = logging.getLogger("aimme.alerts")

ALERTS_CHANNEL = os.environ.get("ALERTS_REDIS_CHANNEL", "alerts")


async def publish_alert(payload: dict[str, Any]) -> None:
    """
    Log an alert at WARNING and publish JSON to Redis channel ``alerts``
    (override with ALERTS_REDIS_CHANNEL).
    """
    body = {**payload, "timestamp": int(time.time())}
    msg = json.dumps(body, separators=(",", ":"))
    alert_logger.warning("%s", msg)

    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    client = redis.from_url(url, decode_responses=True)
    try:
        n = await client.publish(ALERTS_CHANNEL, msg)
        logger.debug("redis publish channel=%s receivers=%s", ALERTS_CHANNEL, n)
    except Exception as exc:  # noqa: BLE001 — do not fail callers
        logger.error("redis publish failed: %s", exc)
    finally:
        await client.aclose()
