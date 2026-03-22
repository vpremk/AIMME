"""
Groq OpenAI-compatible chat completions (stub-friendly: real HTTP when key is set).
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

from mock_inference import InferInput, InferOutput

logger = logging.getLogger(__name__)

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"


def _extract_json_object(text: str) -> dict[str, Any] | None:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            return None
    return None


async def infer_with_groq(inp: InferInput) -> InferOutput:
    """
    Call Groq chat completions and map JSON fields to InferOutput.
    Requires GROQ_API_KEY; model from GROQ_MODEL (default: llama-3.1-8b-instant).
    """
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not set")

    model = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
    system = (
        "You are a capital-markets assistant. Given market fields, respond with "
        'ONLY a single JSON object (no markdown) with keys: '
        '"signal" (string: BUY, SELL, or HOLD), '
        '"confidence" (number 0-1), '
        '"anomaly" (boolean), '
        '"summary" (short string).'
    )
    user_payload = json.dumps(inp.model_dump(), separators=(",", ":"))

    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_payload},
        ],
        "temperature": 0.2,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(GROQ_CHAT_URL, json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected Groq response shape: {data!r}") from exc

    if not isinstance(content, str):
        raise RuntimeError("Groq message content is not a string")

    parsed = _extract_json_object(content)
    if not parsed:
        raise RuntimeError(f"Could not parse JSON from Groq: {content!r}")

    signal = str(parsed.get("signal", "HOLD")).upper()
    if signal not in ("BUY", "SELL", "HOLD"):
        signal = "HOLD"

    confidence = float(parsed.get("confidence", 0.5))
    confidence = max(0.0, min(1.0, confidence))

    anomaly = bool(parsed.get("anomaly", False))
    summary = str(parsed.get("summary", "Groq inference."))

    return InferOutput(
        signal=signal,
        confidence=confidence,
        anomaly=anomaly,
        summary=summary,
    )
