"""
Consume Redis stream `market_data` → AI infer → persist signal via API.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from typing import Any

import httpx
from redis.asyncio import Redis

logger = logging.getLogger(__name__)

REDIS_LAST_KEY = "aimme:processor:last_stream_id"


def _env_float(name: str, default: str) -> float:
    return float(os.environ.get(name, default))


def _decode_fields(fields: dict[Any, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in fields.items():
        ks = k.decode() if isinstance(k, bytes) else str(k)
        vs = v.decode() if isinstance(v, bytes) else str(v)
        out[ks] = vs
    return out


def _normalize_entry_id(entry_id: Any) -> str:
    if isinstance(entry_id, bytes):
        return entry_id.decode()
    return str(entry_id)


async def _get_last_id(r: Redis) -> str:
    raw = await r.get(REDIS_LAST_KEY)
    if raw is None:
        return os.environ.get("REDIS_STREAM_START", "0-0")
    return raw if isinstance(raw, str) else raw.decode()


async def _set_last_id(r: Redis, entry_id: str) -> None:
    await r.set(REDIS_LAST_KEY, entry_id)


def _derive_trend(
    last_prices: dict[str, float],
    asset: str,
    price: float,
) -> str:
    prev = last_prices.get(asset)
    last_prices[asset] = price
    if prev is None:
        return "NEUTRAL"
    if price > prev * 1.001:
        return "UP"
    if price < prev * 0.999:
        return "DOWN"
    return "NEUTRAL"


async def _run() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
    )

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    stream = os.environ.get("REDIS_STREAM", "market_data")
    ai_url = os.environ.get("AI_SERVICE_URL", "http://localhost:8001").rstrip("/")
    api_url = os.environ.get("API_URL", "http://localhost:8000").rstrip("/")
    whale_threshold = _env_float("WHALE_VOLUME_THRESHOLD", "500000")

    last_prices: dict[str, float] = {}

    r = Redis.from_url(redis_url, decode_responses=True)
    await r.ping()
    logger.info(
        "processor started stream=%s ai=%s api=%s whale_threshold=%s",
        stream,
        ai_url,
        api_url,
        whale_threshold,
    )

    async with httpx.AsyncClient(timeout=60.0) as client:
        while True:
            last_id = await _get_last_id(r)
            result = await r.xread({stream: last_id}, count=10, block=5000)
            if not result:
                continue
            for _sname, entries in result:
                for entry_id, raw_fields in entries:
                    eid = _normalize_entry_id(entry_id)
                    fields = _decode_fields(raw_fields)
                    try:
                        asset = fields["asset"]
                        price = float(fields["price"])
                        volume = float(fields["volume"])
                        ts = int(fields.get("timestamp", "0"))
                    except (KeyError, ValueError) as exc:
                        logger.error("bad stream entry %s: %s fields=%s", eid, exc, fields)
                        await _set_last_id(r, eid)
                        continue

                    logger.info(
                        "ingestion_event id=%s asset=%s price=%s volume=%s ts=%s",
                        eid,
                        asset,
                        price,
                        volume,
                        ts,
                    )

                    whale_trade = volume >= whale_threshold
                    trend = _derive_trend(last_prices, asset, price)

                    infer_body = {
                        "asset": asset,
                        "price": price,
                        "volume": volume,
                        "whale_trade": whale_trade,
                        "trend": trend,
                    }

                    try:
                        ir = await client.post(f"{ai_url}/infer", json=infer_body)
                        ir.raise_for_status()
                        inf = ir.json()
                    except Exception as exc:  # noqa: BLE001
                        logger.exception("AI infer failed: %s", exc)
                        await _set_last_id(r, eid)
                        continue

                    logger.info(
                        "ai_signal asset=%s signal=%s confidence=%s anomaly=%s",
                        asset,
                        inf.get("signal"),
                        inf.get("confidence"),
                        inf.get("anomaly"),
                    )

                    sig_body = {
                        "asset": asset,
                        "timestamp": ts,
                        "signal": inf["signal"],
                        "confidence": float(inf["confidence"]),
                        "anomaly": bool(inf["anomaly"]),
                    }
                    try:
                        sr = await client.post(f"{api_url}/signals", json=sig_body)
                        sr.raise_for_status()
                        stored = sr.json()
                    except Exception as exc:  # noqa: BLE001
                        logger.exception("API store failed: %s", exc)
                        await _set_last_id(r, eid)
                        continue

                    logger.info(
                        "api_stored id=%s asset=%s signal=%s anomaly=%s",
                        stored.get("id"),
                        asset,
                        stored.get("signal"),
                        stored.get("anomaly"),
                    )

                    await _set_last_id(r, eid)


def main() -> None:
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        logger.info("shutdown")


if __name__ == "__main__":
    main()
