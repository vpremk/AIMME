"""
Processing Lambda — DynamoDB stream (`type=raw`) → mock signal row (`type=signal`).
Aligns with AIMME table: PK asset, SK timestamp, optional Groq via USE_GROQ.

CDK still points at Node `lambda/processing/handler.ts` until you switch runtime.
"""
import json
import os
import time
from decimal import Decimal

import boto3
from boto3.dynamodb.types import TypeDeserializer
from fastapi import FastAPI, HTTPException, Request

TABLE_NAME = os.environ.get("TABLE_NAME", "SignalsTable")
# USE_GROQ / GROQ_API_KEY reserved for real Groq wiring
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
_deser = TypeDeserializer()


def _row_from_stream_image(new_image: dict) -> dict:
    return {k: _deser.deserialize(v) for k, v in new_image.items()}


def _volume_from_payload(payload: dict) -> int:
    v = payload.get("volume", 0)
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


app = FastAPI(title="AIMME Processing")


@app.post("/process")
async def process_signal(request: Request):
    """Local test: send one raw-shaped item (same keys as DynamoDB item)."""
    data = await request.json()
    if data.get("type") != "raw":
        raise HTTPException(400, "type must be raw")
    _write_signal_from_raw(data)
    return {"status": "ok"}


def _write_signal_from_raw(row: dict) -> None:
    asset = row.get("asset")
    if not asset:
        return
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    vol = _volume_from_payload(payload)
    processed_signal = "BUY" if vol > 1000 else "HOLD"
    confidence = Decimal("0.85") if processed_signal == "BUY" else Decimal("0.55")

    table.put_item(
        Item={
            "asset": asset,
            "timestamp": int(time.time() * 1000),
            "type": "signal",
            "signal": processed_signal,
            "score": confidence,
            "anomaly": processed_signal == "BUY" and vol > 500_000,
            "sourceTimestamp": row.get("timestamp"),
        }
    )


def handler(event, context):
    """DynamoDB Streams batch."""
    for record in event.get("Records", []):
        if record.get("eventName") not in ("INSERT", "MODIFY"):
            continue
        new_image = record.get("dynamodb", {}).get("NewImage")
        if not new_image:
            continue
        row = _row_from_stream_image(new_image)
        if row.get("type") != "raw":
            continue
        _write_signal_from_raw(row)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
