import json
import os
import time
from decimal import Decimal
from typing import Any

import boto3

TABLE_NAME = os.environ.get("TABLE_NAME", "SignalsTable")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

try:
    from fastapi import FastAPI, HTTPException, Request
    from mangum import Mangum
except Exception:
    FastAPI = None
    HTTPException = Exception
    Request = Any
    Mangum = None


def _as_http(code: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str),
    }


def _request_id(event: dict[str, Any], context: Any) -> str:
    api_id = (event.get("requestContext") or {}).get("requestId")
    if api_id:
        return str(api_id)
    lambda_id = getattr(context, "aws_request_id", None)
    if lambda_id:
        return str(lambda_id)
    return "unknown"


def _inject_request_id(resp: dict[str, Any], request_id: str) -> dict[str, Any]:
    headers = dict(resp.get("headers") or {})
    headers["x-request-id"] = request_id
    resp["headers"] = headers

    body_raw = resp.get("body")
    if isinstance(body_raw, str):
        try:
            parsed = json.loads(body_raw)
            if isinstance(parsed, dict):
                parsed["requestId"] = request_id
                resp["body"] = json.dumps(parsed, default=str)
        except json.JSONDecodeError:
            pass
    return resp


def _create_raw_item(data: dict[str, Any]) -> dict[str, Any]:
    asset = data.get("asset")
    if not asset:
        raise ValueError("asset required")
    item = {
        "asset": str(asset),
        "timestamp": int(data.get("timestamp") or time.time() * 1000),
        "type": "raw",
        "payload": data.get("payload") if isinstance(data.get("payload"), dict) else {},
    }
    table.put_item(Item=_to_ddb(item))
    return item


def _to_ddb(value: Any) -> Any:
    """Recursively convert floats to Decimal for DynamoDB."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    return value


if FastAPI is not None:
    app = FastAPI(title="AIMME Ingestion")

    @app.get("/signals")
    async def get_signals(limit: int = 50):
        res = table.scan(Limit=max(1, min(int(limit), 500)))
        return {"items": res.get("Items", []), "count": res.get("Count", 0)}

    @app.post("/signals")
    async def post_signals(request: Request):
        data = await request.json()
        try:
            item = _create_raw_item(data)
        except ValueError as e:
            raise HTTPException(400, str(e))
        return {"status": "success", "item": item}

    _mangum = Mangum(app, lifespan="off")
else:
    app = None
    _mangum = None


def handler(event, context):
    rid = _request_id(event, context)
    if _mangum is not None and (
        "requestContext" in event or "httpMethod" in event or event.get("version") in ("1.0", "2.0")
    ):
        return _inject_request_id(_mangum(event, context), rid)

    method = event.get("httpMethod", "POST")
    path = event.get("path", "/signals")

    if method == "GET" and path.endswith("/signals"):
        limit = 50
        qs = event.get("queryStringParameters") or {}
        if qs.get("limit"):
            try:
                limit = int(qs["limit"])
            except Exception:
                pass
        res = table.scan(Limit=max(1, min(limit, 500)))
        return _as_http(200, {"items": res.get("Items", []), "count": res.get("Count", 0), "requestId": rid})

    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _as_http(400, {"error": "invalid json", "requestId": rid})
    try:
        item = _create_raw_item(data)
    except ValueError as e:
        return _as_http(400, {"error": str(e), "requestId": rid})
    return _as_http(200, {"status": "success", "item": item, "requestId": rid})
