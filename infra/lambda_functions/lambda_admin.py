import json
import os
import time
from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

USER_MGMT_TABLE_NAME = os.environ.get("USER_MGMT_TABLE_NAME", "UserManagementTable")
SIGNALS_TABLE_NAME = os.environ.get("TABLE_NAME", "SignalsTable")

dynamodb = boto3.resource("dynamodb")
user_mgmt_table = dynamodb.Table(USER_MGMT_TABLE_NAME)
signals_table = dynamodb.Table(SIGNALS_TABLE_NAME)


def _as_http(code: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str),
    }


def _normalize_user_item(item: dict[str, Any]) -> dict[str, Any]:
    out = dict(item)
    lc = out.get("loginCount")
    if lc is not None:
        try:
            out["loginCount"] = int(lc)
        except (TypeError, ValueError):
            out["loginCount"] = 0
    else:
        out["loginCount"] = 0
    return out


def _list_users(limit: int) -> dict[str, Any]:
    res = user_mgmt_table.scan(Limit=max(1, min(limit, 200)))
    items = [_normalize_user_item(x) for x in res.get("Items", [])]
    return {"items": items, "count": res.get("Count", 0)}


def _increment_login(uid: str) -> dict[str, Any]:
    now_ms = int(time.time() * 1000)
    user_mgmt_table.update_item(
        Key={"userId": uid},
        UpdateExpression="ADD loginCount :one SET lastLoginAt = :now",
        ExpressionAttributeValues={":one": 1, ":now": now_ms},
    )
    return {"userId": uid, "status": "ok"}


def _update_user_role(data: dict[str, Any]) -> dict[str, Any]:
    user_id = str(data.get("userId") or "").strip()
    role = str(data.get("role") or "").strip().lower()
    if not user_id:
        raise ValueError("userId required")
    if role not in ("trader", "analyst", "ops"):
        raise ValueError("role must be trader|analyst|ops")

    now_ms = int(time.time() * 1000)
    user_mgmt_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET #role=:role, #updatedAt=:updatedAt",
        ExpressionAttributeNames={"#role": "role", "#updatedAt": "updatedAt"},
        ExpressionAttributeValues={":role": role, ":updatedAt": now_ms},
        ConditionExpression=Attr("userId").exists(),
    )
    return {"userId": user_id, "role": role, "updatedAt": now_ms}


def _ops_stats() -> dict[str, Any]:
    rows = signals_table.scan(Limit=500).get("Items", [])
    raw_rows = [r for r in rows if r.get("type") == "raw"]
    signal_rows = [r for r in rows if r.get("type") == "signal"]
    missing_user = [
        r
        for r in raw_rows
        if not r.get("userId") or not r.get("userName") or r.get("termsAccepted") is not True
    ]
    return {
        "totalRows": len(rows),
        "rawRows": len(raw_rows),
        "signalRows": len(signal_rows),
        "rawMissingUserOrConsent": len(missing_user),
    }


def handler(event, _context):
    method = (event.get("httpMethod") or "GET").upper()
    path = str(event.get("path") or "")

    if method == "POST" and path.endswith("/admin/users/login"):
        try:
            data = json.loads(event.get("body") or "{}")
            uid = str(data.get("userId") or "").strip()
            if not uid:
                return _as_http(400, {"error": "userId required"})
            return _as_http(200, _increment_login(uid))
        except ClientError as exc:
            return _as_http(500, {"error": str(exc)})

    if method == "GET" and path.endswith("/admin/users"):
        qs = event.get("queryStringParameters") or {}
        limit = int(qs.get("limit") or 50)
        return _as_http(200, _list_users(limit))

    if method == "POST" and path.endswith("/admin/users"):
        try:
            data = json.loads(event.get("body") or "{}")
            out = _update_user_role(data)
            return _as_http(200, {"status": "ok", "item": out})
        except ValueError as exc:
            return _as_http(400, {"error": str(exc)})
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return _as_http(404, {"error": "user not found"})
            return _as_http(500, {"error": "failed to update user role"})

    if method == "GET" and path.endswith("/admin/ops"):
        return _as_http(200, _ops_stats())

    return _as_http(404, {"error": "not found"})
