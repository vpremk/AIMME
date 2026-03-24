"""Massive JSON-RPC WebSocket: newHeads subscription with reconnect."""

from __future__ import annotations

import asyncio
import json
import logging
import random
from collections.abc import Awaitable, Callable
from typing import Any

import websockets

logger = logging.getLogger(__name__)

OnBlockHash = Callable[[str], Awaitable[None]]


def _parse_block_hash(message: dict[str, Any]) -> str | None:
    if message.get("method") != "eth_subscription":
        return None
    params = message.get("params") or {}
    result = params.get("result")
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        h = result.get("hash")
        if isinstance(h, str):
            return h
    return None


async def subscribe_new_heads(
    wss_url: str,
    on_block_hash: OnBlockHash,
    *,
    max_backoff_s: float = 60.0,
) -> None:
    """
    Loop forever: connect, subscribe to newHeads, call on_block_hash for each block.
    Reconnects with exponential backoff + jitter on disconnect or error.
    """
    backoff = 1.0
    req_id = 1

    while True:
        ws: Any = None
        try:
            logger.info("Connecting Massive WebSocket: %s", wss_url)
            ws = await websockets.connect(
                wss_url,
                ping_interval=20,
                ping_timeout=20,
                close_timeout=10,
            )
            backoff = 1.0

            sub_msg = {
                "jsonrpc": "2.0",
                "id": req_id,
                "method": "eth_subscribe",
                "params": ["newHeads"],
            }
            req_id += 1
            await ws.send(json.dumps(sub_msg))
            raw = await ws.recv()
            ack = json.loads(raw)
            if ack.get("error"):
                raise RuntimeError(ack["error"])
            sub_id = ack.get("result")
            logger.info("Subscribed newHeads subscription_id=%s", sub_id)

            while True:
                raw = await ws.recv()
                data = json.loads(raw)
                bh = _parse_block_hash(data)
                if bh:
                    await on_block_hash(bh)

        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — reconnect path
            logger.warning(
                "Massive stream error (%s), reconnecting in %.1fs",
                exc,
                min(backoff, max_backoff_s),
            )
            await asyncio.sleep(backoff + random.uniform(0, 0.5 * backoff))
            backoff = min(backoff * 2, max_backoff_s)
        finally:
            if ws is not None:
                try:
                    await ws.close()
                except Exception:  # noqa: BLE001 — best-effort close
                    pass
