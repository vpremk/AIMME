"""
Ingestion Lambda — API Gateway POST body → DynamoDB `type=raw` rows.
CDK currently deploys Node handlers; wire this file with Python `lambda.Function` to use it.

Env: TABLE_NAME (set by CDK; default only for local tests)
"""
import json
import os
import time

import boto3
from fastapi import FastAPI, HTTPException, Request

TABLE_NAME = os.environ.get("TABLE_NAME", "SignalsTable")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

app = FastAPI(title="AIMME Ingestion")


@app.post("/ingest")
async def ingest_signal(request: Request):
    """Local: POST JSON { \"asset\", \"payload\": {... optional price/volume } }"""
    data = await request.json()
    asset = data.get("asset")
    if not asset:
        raise HTTPException(400, "asset is required")
    item = {
        "asset": asset,
        "timestamp": int(data.get("timestamp") or time.time() * 1000),
        "type": "raw",
        "payload": data.get("payload") if isinstance(data.get("payload"), dict) else {},
    }
    table.put_item(Item=item)
    return {"status": "success", "item": item}


def handler(event, context):
    """
    REST API (proxy integration): body is JSON string.
    Not used for EventBridge until you add that branch.
    """
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {"statusCode": 400, "body": json.dumps({"error": "invalid json"})}

    asset = body.get("asset")
    if not asset:
        return {"statusCode": 400, "body": json.dumps({"error": "asset required"})}

    item = {
        "asset": asset,
        "timestamp": int(body.get("timestamp") or time.time() * 1000),
        "type": "raw",
        "payload": body.get("payload") if isinstance(body.get("payload"), dict) else {},
    }
    table.put_item(Item=item)
    return {"statusCode": 200, "body": json.dumps({"status": "success", "item": item})}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
