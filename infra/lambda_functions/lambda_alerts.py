import json
import os
from typing import Any

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
    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=f"[AIMME] {row.get('asset', '?')}",
        Message=json.dumps(row, default=str),
    )


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
