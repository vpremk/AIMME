#!/usr/bin/env bash
# End-to-end pipeline: ingestion → Redis → processor → AI → API → alerts (via AI on anomaly).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building and starting: redis, ai_service, api, ingestion, processor"
docker compose up -d --build redis ai_service api ingestion processor

echo "==> Waiting for events to flow (18s)..."
sleep 18

echo ""
echo "==> GET /signals (latest)"
curl -s "http://localhost:8000/signals?limit=10" | python3 -m json.tool || true

echo ""
echo "==> --- ingestion (last 18 lines) ---"
docker compose logs ingestion --tail=18

echo ""
echo "==> --- ingestion: mock events (grep) ---"
docker compose logs ingestion --tail=80 | grep -E "mock asset|XADD|market_data" || true

echo ""
echo "==> --- processor (last 30 lines) ---"
docker compose logs processor --tail=30

echo ""
echo "==> --- ai_service: inference + aimme.alerts (last 40 lines, filtered) ---"
docker compose logs ai_service --tail=40 | grep -E "INFO|WARNING aimme\.alerts|ai_signal" || docker compose logs ai_service --tail=40

echo ""
echo "==> Optional: push one manual stream row"
echo "    REDIS_URL=redis://localhost:6380/0 python3 scripts/sample_pipeline.py"
