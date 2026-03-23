import json
import os
from typing import Any
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.types import TypeDeserializer

try:
    from fastapi import FastAPI, HTTPException, Request
    from mangum import Mangum
except Exception:
    FastAPI = None
    HTTPException = Exception
    Request = Any
    Mangum = None

SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN")
sns = boto3.client("sns")
_deser = TypeDeserializer()


def _from_stream(new_image: dict) -> dict:
    return {k: _deser.deserialize(v) for k, v in new_image.items()}


def _should_alert(row: dict) -> bool:
    if row.get("type") != "signal":
        return False
    sig = str(row.get("signal", "")).upper()
    if sig in ("BUY", "SELL", "ANOMALY"):
        return True
    if row.get("anomaly") is True:
        return True
    try:
        score = float(row.get("score") or 0.5)
    except Exception:
        score = 0.5
    return score >= 0.9 or score <= 0.1


def _publish(row: dict) -> None:
    if not SNS_TOPIC_ARN:
        raise RuntimeError("SNS_TOPIC_ARN is not set")
    payload = _trader_friendly_message(row)
    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=f"[AIMME] {row.get('asset', '?')}",
        Message=json.dumps(payload, default=str),
    )


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _to_iso_ms(epoch_ms: int) -> str:
    dt = datetime.fromtimestamp(max(epoch_ms, 0) / 1000.0, tz=timezone.utc)
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _signal_strength(score: float) -> str:
    if score >= 0.8:
        return "HIGH"
    if score >= 0.6:
        return "MEDIUM"
    return "LOW"


def _action_hint(signal: str, score: float) -> str:
    s = signal.upper()
    if s == "BUY":
        return "Bias long; monitor pullbacks and volume confirmation."
    if s == "SELL":
        return "Bias short; watch rejection and downside follow-through."
    if score >= 0.8:
        return "High-confidence setup; wait for risk-aligned entry."
    return "No strong edge; monitor for confirmation."


def _trader_friendly_message(row: dict) -> dict:
    score = _to_float(row.get("score"), 0.5)
    event_ts = _to_int(row.get("timestamp"), 0)
    source_ts = _to_int(row.get("sourceTimestamp"), event_ts)
    now_ts = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    signal = str(row.get("signal", "HOLD")).upper()

    ai_used = str(row.get("aiProvider", "")).lower() == "groq"
    message = {
        "alertType": "AIMME_SIGNAL",
        "asset": str(row.get("asset", "?")),
        "signal": signal,
        "confidenceScore": round(score, 3),
        "isAnomaly": bool(row.get("anomaly", False)),
        "genAIUsed": ai_used,
        "signalStrength": _signal_strength(score),
        "eventTime": _to_iso_ms(event_ts),
        "sourceEventTime": _to_iso_ms(source_ts),
        "alertTime": _to_iso_ms(now_ts),
        "latencyMs": max(0, now_ts - source_ts),
        "actionHint": _action_hint(signal, score),
        "source": {
            "system": "AIMME",
            "topicArn": SNS_TOPIC_ARN,
        },
    }
    if ai_used:
        model = str(row.get("aiModel") or "groq-model")
        message["genAIMessage"] = (
            f"Generated with Groq API ({model}); validate with market context and risk limits."
        )
    return message


if FastAPI is not None:
    app = FastAPI(title="AIMME Alerts")

    @app.post("/alert")
    async def alert_test(request: Request):
        data = await request.json()
        row = {**data, "type": "signal"}
        if not _should_alert(row):
            raise HTTPException(400, "criteria not met")
        _publish(row)
        return {"status": "published"}

    _mangum = Mangum(app, lifespan="off")
else:
    _mangum = None


def handler(event, context):
    recs = event.get("Records") or []
    if recs and recs[0].get("eventSource") == "aws:dynamodb":
        for record in recs:
            if record.get("eventName") not in ("INSERT", "MODIFY"):
                continue
            new_image = record.get("dynamodb", {}).get("NewImage")
            if not new_image:
                continue
            row = _from_stream(new_image)
            if _should_alert(row):
                _publish(row)
        return {"batchItemFailures": []}

    if _mangum is not None:
        return _mangum(event, context)

    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {"statusCode": 400, "body": json.dumps({"error": "invalid json"})}
    row = {**data, "type": "signal"}
    if not _should_alert(row):
        return {"statusCode": 400, "body": json.dumps({"error": "criteria not met"})}
    _publish(row)
    return {"statusCode": 200, "body": json.dumps({"status": "published"})}
