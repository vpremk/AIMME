import json
import os
from decimal import Decimal
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

OUTLIER_PRIOR_N = int(os.environ.get("VOLUME_OUTLIER_PRIOR_N", "10"))
OUTLIER_FACTOR = float(os.environ.get("VOLUME_OUTLIER_FACTOR", "1.5"))
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN")
TABLE_NAME = os.environ.get("TABLE_NAME", "SignalsTable")
ORG_LEDGER_INDEX = os.environ.get("ORG_LEDGER_INDEX", "OrgLedgerIndex")
QUERY_PAGE_LIMIT = int(os.environ.get("VOLUME_OUTLIER_QUERY_PAGE_ITEMS", "50"))
MAX_QUERY_PAGES = int(os.environ.get("VOLUME_OUTLIER_MAX_PAGES", "16"))

sns = boto3.client("sns")
_ddb = boto3.resource("dynamodb")
_signals_table = None
_deser = TypeDeserializer()


def _signals_table():
    global _signals_table
    if _signals_table is None:
        _signals_table = _ddb.Table(TABLE_NAME)
    return _signals_table


def _from_stream(new_image: dict) -> dict:
    return {k: _deser.deserialize(v) for k, v in new_image.items()}


def _raw_payload_volume_only(row: dict) -> float | None:
    """Volume for outlier logic: raw rows only, from payload.volume."""
    payload = row.get("payload")
    if not isinstance(payload, dict):
        return None
    v = payload.get("volume")
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _collect_prior_raw_volumes(org_id: str, asset: str, before_ts: int) -> list[float]:
    """Newest-first GSI walk; collect `payload.volume` from prior raw rows (same org + asset)."""
    out: list[float] = []
    start_key = None
    for _ in range(MAX_QUERY_PAGES):
        kw: dict[str, Any] = {
            "IndexName": ORG_LEDGER_INDEX,
            "KeyConditionExpression": "orgId = :o",
            "ExpressionAttributeValues": {":o": org_id},
            "ScanIndexForward": True,
            "Limit": QUERY_PAGE_LIMIT,
        }
        if start_key:
            kw["ExclusiveStartKey"] = start_key
        resp = _signals_table().query(**kw)
        for item in resp.get("Items") or []:
            if item.get("type") != "raw":
                continue
            if str(item.get("asset") or "").strip() != asset:
                continue
            it_ts = _to_int(item.get("timestamp"), 0)
            if it_ts >= before_ts:
                continue
            vol = _raw_payload_volume_only(item)
            if vol is None:
                continue
            out.append(vol)
            if len(out) >= OUTLIER_PRIOR_N:
                return out
        start_key = resp.get("LastEvaluatedKey")
        if not start_key:
            break
    return out


def _volume_outlier_raw_should_fire(row: dict) -> tuple[bool, dict[str, Any]]:
    """True if this raw row's payload.volume > OUTLIER_FACTOR * mean(last OUTLIER_PRIOR_N raw volumes)."""
    if row.get("type") != "raw":
        return False, {"reason": "not_raw"}
    org_id = str(row.get("orgId") or "").strip()
    asset = str(row.get("asset") or "").strip()
    if not org_id or not asset:
        return False, {"reason": "missing_org_or_asset"}
    ts = _to_int(row.get("timestamp"), 0)
    if ts <= 0:
        return False, {"reason": "bad_timestamp"}
    cur = _raw_payload_volume_only(row)
    if cur is None:
        return False, {"reason": "no_payload_volume"}

    priors = _collect_prior_raw_volumes(org_id, asset, ts)
    if len(priors) < OUTLIER_PRIOR_N:
        return False, {"reason": "insufficient_history", "have": len(priors)}
    avg = sum(priors) / float(OUTLIER_PRIOR_N)
    if avg <= 0:
        return False, {"reason": "zero_baseline", "baselineAvg": avg}
    if cur > OUTLIER_FACTOR * avg:
        return True, {
            "baselineAvg": avg,
            "currentVolume": cur,
            "factor": OUTLIER_FACTOR,
            "priorN": OUTLIER_PRIOR_N,
            "orgId": org_id,
        }
    return False, {"baselineAvg": avg, "currentVolume": cur}


def _org_ledger_sk(timestamp_ms: int, asset: str) -> str:
    pad = 10**18
    return f"{pad - int(timestamp_ms)}#{asset}"


def _dec(x: Any) -> Decimal:
    return Decimal(str(x))


def _write_volume_outlier_signal_row(raw_row: dict, meta: dict[str, Any]) -> None:
    """Persist a dashboard-visible signal row so the UI can link to volume-outlier docs."""
    ts_out = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    asset_s = str(raw_row.get("asset") or "").strip()
    org_id = str(meta.get("orgId") or raw_row.get("orgId") or "").strip()
    if not asset_s or not org_id:
        return
    cur = meta.get("currentVolume")
    avg = float(meta.get("baselineAvg", 0))
    item: dict[str, Any] = {
        "asset": asset_s,
        "timestamp": ts_out,
        "type": "signal",
        "orgId": org_id,
        "orgLedgerSk": _org_ledger_sk(ts_out, asset_s),
        "signal": "VOLUME_OUTLIER",
        "score": Decimal("0.95"),
        "anomaly": True,
        "sourceTimestamp": _to_int(raw_row.get("timestamp"), ts_out),
        "alertSource": "volume_outlier",
        "baselineAvgVolume": _dec(round(avg, 6)),
        "volumeOutlierFactor": _dec(OUTLIER_FACTOR),
        "priorSampleSize": OUTLIER_PRIOR_N,
        "aiProvider": "rules",
        "aiModel": "volume-outlier-stream",
    }
    if cur is not None:
        item["sourceVolume"] = _dec(cur)
    uid = raw_row.get("userId")
    if uid is not None:
        item["userId"] = uid
    unm = raw_row.get("userName")
    if unm is not None:
        item["userName"] = unm
    _signals_table().put_item(Item=item)


def _volume_outlier_message(row: dict, meta: dict[str, Any]) -> dict[str, Any]:
    event_ts = _to_int(row.get("timestamp"), 0)
    now_ts = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    return {
        "alertType": "AIMME_VOLUME_OUTLIER",
        "asset": str(row.get("asset", "?")),
        "orgId": meta.get("orgId"),
        "currentVolume": meta.get("currentVolume"),
        "baselineAvgVolume": round(float(meta.get("baselineAvg", 0)), 4),
        "outlierFactor": meta.get("factor"),
        "priorSampleSize": meta.get("priorN"),
        "rawPayloadSnapshot": {"volume": payload.get("volume")},
        "eventTime": _to_iso_ms(event_ts),
        "alertTime": _to_iso_ms(now_ts),
        "source": {
            "system": "AIMME",
            "topicArn": SNS_TOPIC_ARN,
            "rule": f"payload.volume > {OUTLIER_FACTOR} * avg(last {OUTLIER_PRIOR_N} raw payload.volume)",
        },
    }


def _publish_volume_outlier(row: dict, meta: dict[str, Any]) -> None:
    if not SNS_TOPIC_ARN:
        raise RuntimeError("SNS_TOPIC_ARN is not set")
    body = _volume_outlier_message(row, meta)
    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=f"[AIMME] VOLUME_OUTLIER {row.get('asset', '?')}",
        Message=json.dumps(body, default=str),
    )


def _should_alert(row: dict) -> bool:
    if row.get("type") != "signal":
        return False
    if row.get("alertSource") == "volume_outlier":
        return False
    sig = str(row.get("signal", "")).upper()
    if sig == "VOLUME_OUTLIER":
        return False
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
            ev = record.get("eventName")
            if ev == "INSERT" and row.get("type") == "raw":
                try:
                    fire, meta = _volume_outlier_raw_should_fire(row)
                    if fire:
                        _publish_volume_outlier(row, meta)
                        try:
                            _write_volume_outlier_signal_row(row, meta)
                        except Exception as exc:
                            print(f"volume_outlier_ddb_write_error reason={exc}")
                except Exception as exc:
                    print(f"volume_outlier_raw_error reason={exc}")
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
