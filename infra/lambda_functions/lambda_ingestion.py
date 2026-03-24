import json
import os
import time
from decimal import Decimal
from typing import Any

import boto3
from botocore.exceptions import ClientError
from firebase_admin_secret import load_firebase_admin_secret

TABLE_NAME = os.environ.get("TABLE_NAME", "SignalsTable")
USER_MGMT_TABLE_NAME = os.environ.get("USER_MGMT_TABLE_NAME", "UserManagementTable")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
user_mgmt_table = dynamodb.Table(USER_MGMT_TABLE_NAME)
_firebase_secret_checked = False

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
    terms_accepted = bool(data.get("termsAccepted"))
    if not terms_accepted:
        raise ValueError("termsAccepted must be true")
    user_id = str(data.get("userId") or "").strip()
    user_name = str(data.get("userName") or "").strip()
    if not user_id:
        raise ValueError("userId required")
    if not user_name:
        raise ValueError("userName required")
    _upsert_user_management(user_id, user_name, terms_accepted)
    item = {
        "asset": str(asset),
        "timestamp": int(data.get("timestamp") or time.time() * 1000),
        "type": "raw",
        "payload": data.get("payload") if isinstance(data.get("payload"), dict) else {},
        "userId": user_id,
        "userName": user_name,
        "termsAccepted": terms_accepted,
        "consentContext": "Hackathon data capture consent",
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


def _check_firebase_secret_once() -> None:
    """
    Best-effort startup validation for Firebase Admin secret wiring.
    We only log status here; ingestion flow should remain available.
    """
    global _firebase_secret_checked
    if _firebase_secret_checked:
        return
    _firebase_secret_checked = True
    try:
        secret = load_firebase_admin_secret()
        print(
            "firebase_secret_check=ok",
            json.dumps(
                {
                    "projectId": secret.get("projectId"),
                    "clientEmail": secret.get("clientEmail"),
                }
            ),
        )
    except Exception as exc:
        print(f"firebase_secret_check=error reason={exc}")


def _upsert_user_management(user_id: str, user_name: str, terms_accepted: bool) -> None:
    now_ms = int(time.time() * 1000)
    try:
        user_mgmt_table.put_item(
            Item={
                "userId": user_id,
                "name": user_name,
                "role": "trader",
                "termsAccepted": terms_accepted,
                "loginCount": 0,
                "createdAt": now_ms,
                "updatedAt": now_ms,
            },
            ConditionExpression="attribute_not_exists(userId)",
        )
        print(f"user_mgmt_created=true userId={user_id} role=trader")
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        user_mgmt_table.update_item(
            Key={"userId": user_id},
            UpdateExpression=(
                "SET #name = :name, #updatedAt = :updatedAt, "
                "#termsAccepted = :termsAccepted, #lastSeenAt = :lastSeenAt"
            ),
            ExpressionAttributeNames={
                "#name": "name",
                "#updatedAt": "updatedAt",
                "#termsAccepted": "termsAccepted",
                "#lastSeenAt": "lastSeenAt",
            },
            ExpressionAttributeValues={
                ":name": user_name,
                ":updatedAt": now_ms,
                ":termsAccepted": terms_accepted,
                ":lastSeenAt": now_ms,
            },
        )
        print(f"user_mgmt_created=false userId={user_id}")


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
    _check_firebase_secret_once()
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
