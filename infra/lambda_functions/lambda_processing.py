import json
import os
import time
from decimal import Decimal
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

TABLE_NAME = os.environ.get("TABLE_NAME", "SignalsTable")
USE_GROQ = str(os.environ.get("USE_GROQ", "false")).lower() == "true"
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
_deser = TypeDeserializer()


def _org_ledger_sk(timestamp_ms: int, asset: str) -> str:
    pad = 10**18
    return f"{pad - int(timestamp_ms)}#{asset}"


def _from_stream(new_image: dict) -> dict:
    return {k: _deser.deserialize(v) for k, v in new_image.items()}


def _process_raw(row: dict) -> None:
    if row.get("type") != "raw":
        return
    asset = row.get("asset")
    if not asset:
        return
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    vol = int(payload.get("volume") or 0)
    if vol >= 1000:
        signal = "BUY"
        score = Decimal("0.85")
    elif vol <= 300:
        signal = "SELL"
        score = Decimal("0.20")
    else:
        signal = "HOLD"
        score = Decimal("0.55")
    ts_out = int(time.time() * 1000)
    asset_s = str(asset)
    org_id = row.get("orgId") or "__public__"
    item_out = {
        "asset": asset_s,
        "timestamp": ts_out,
        "type": "signal",
        "orgId": str(org_id),
        "orgLedgerSk": _org_ledger_sk(ts_out, asset_s),
        "signal": signal,
        "score": score,
        "anomaly": signal == "BUY" and vol > 500_000,
        "sourceTimestamp": row.get("timestamp"),
        "userId": row.get("userId"),
        "userName": row.get("userName"),
        "termsAccepted": row.get("termsAccepted"),
        "aiProvider": "groq" if USE_GROQ else "rules",
        "aiModel": GROQ_MODEL if USE_GROQ else "deterministic-volume-rules",
    }
    table.put_item(Item=item_out)


if FastAPI is not None:
    app = FastAPI(title="AIMME Processing")

    @app.post("/process")
    async def process_test(request: Request):
        data = await request.json()
        if data.get("type") != "raw":
            raise HTTPException(400, "type must be raw")
        _process_raw(data)
        return {"status": "ok"}

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
            _process_raw(_from_stream(new_image))
        return

    if _mangum is not None:
        return _mangum(event, context)

    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {"statusCode": 400, "body": json.dumps({"error": "invalid json"})}
    _process_raw(data)
    return {"statusCode": 200, "body": json.dumps({"status": "ok"})}
