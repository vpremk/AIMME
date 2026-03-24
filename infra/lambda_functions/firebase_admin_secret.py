import json
import os
from typing import Any

import boto3

_secrets = boto3.client("secretsmanager")
_cache: dict[str, Any] | None = None


def load_firebase_admin_secret() -> dict[str, Any]:
    """
    Load and cache Firebase Admin credentials from AWS Secrets Manager.
    Expected shape: {"projectId": "...", "clientEmail": "...", "privateKey": "..."}
    """
    global _cache
    if _cache is not None:
        return _cache

    arn = os.environ.get("FIREBASE_SECRET_ARN")
    if not arn:
        raise RuntimeError("FIREBASE_SECRET_ARN is not set")

    resp = _secrets.get_secret_value(SecretId=arn)
    payload = resp.get("SecretString")
    if not payload:
        raise RuntimeError("Firebase secret has no SecretString payload")

    data = json.loads(payload)
    for field in ("projectId", "clientEmail", "privateKey"):
        if not data.get(field):
            raise RuntimeError(f"Firebase secret missing required field: {field}")

    # Support escaped \n private keys from secrets payload.
    data["privateKey"] = str(data["privateKey"]).replace("\\n", "\n")
    _cache = data
    return data
