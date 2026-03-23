"""
AIMME Alerts Lambda
-------------------
- Production: DynamoDB Streams on `type=signal` rows → if anomaly or signal==ANOMALY → SNS publish
- Test: POST /alert with a fake payload to verify SNS wiring

Env: SNS_TOPIC_ARN (required)
"""
from __future__ import annotations

import json
import os
from typing import Any

import boto3
from boto3.dynamodb.types import TypeDeserializer
from fastapi import FastAPI, HTTPException
from mangum import Mangum

_sns = boto3.client("sns")
_deser = TypeDeserializer()
_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")


def _publish(subject: str, message: dict[str, Any]) -> None:
    if not _TOPIC_ARN:
        raise RuntimeError("SNS_TOPIC_ARN is not set")
    _sns.publish(
        TopicArn=_TOPIC_ARN,
        Subject=subject[:100],
        Message=json.dumps(message, indent=2, default=str),
    )


def _should_alert(row: dict[str, Any]) -> bool:
    if row.get("type") != "signal":
        return False
    sig = str(row.get("signal", "")).upper()
    if sig == "ANOMALY":
        return True
    if row.get("anomaly") is True:
        return True
    score = row.get("score")
    try:
        s = float(score) if score is not None else 0.5
    except (TypeError, ValueError):
        s = 0.5
    return s >= 0.9 or s <= 0.1


def _handle_signal_row(row: dict[str, Any]) -> bool:
    if not _should_alert(row):
        return False
    _publish(
        f"[AIMME] Alert {row.get('asset', 'unknown')}",
        {
            "asset": row.get("asset"),
            "timestamp": row.get("timestamp"),
            "signal": row.get("signal"),
            "score": row.get("score"),
            "anomaly": row.get("anomaly"),
        },
    )
    return True


def handle_dynamodb_stream(event: dict, context) -> dict[str, Any]:
    sent = 0
    for rec in event.get("Records", []):
        if rec.get("eventName") not in ("INSERT", "MODIFY"):
            continue
        new_img = rec.get("dynamodb", {}).get("NewImage")
        if not new_img:
            continue
        row = {k: _deser.deserialize(v) for k, v in new_img.items()}
        if _handle_signal_row(row):
            sent += 1
    return {"statusCode": 200, "alerts_sent": sent}


app = FastAPI(title="AIMME Alerts", version="0.1.0")


@app.get("/health")
def health():
    return {"ok": True, "component": "alerts"}


@app.post("/alert")
def alert_test(body: dict[str, Any]):
    """
    Simulate a signal row hitting the alert path (does not read DynamoDB).
    Example: {"asset":"AAPL","timestamp":1,"type":"signal","signal":"ANOMALY","score":0.95}
    """
    if not _should_alert(body):
        raise HTTPException(status_code=400, detail="Criteria not met for alert (use ANOMALY or anomaly=true)")
    _publish("[AIMME] test alert", body)
    return {"status": "published"}


_mangum = Mangum(app, lifespan="off")


def _is_ddb_stream(event: dict) -> bool:
    recs = event.get("Records") or []
    return bool(recs) and recs[0].get("eventSource") == "aws:dynamodb"


def _is_api_gateway_like(event: dict) -> bool:
    return "requestContext" in event or "httpMethod" in event or event.get("version") in (
        "1.0",
        "2.0",
    )


def handler(event, context):
    if _is_ddb_stream(event):
        return handle_dynamodb_stream(event, context)
    if _is_api_gateway_like(event):
        return _mangum(event, context)
    return {"statusCode": 400, "body": json.dumps({"error": "unsupported_event"})}


if __name__ == "__main__":
    import uvicorn

    print("Local alerts test API: http://127.0.0.1:8002/alert")
    uvicorn.run(app, host="0.0.0.0", port=8002)
