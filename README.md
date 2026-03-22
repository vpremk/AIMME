# AIMME

Local-first scaffold for a real-time AI capital markets platform.

## Stack

- **Python 3.11**
- **FastAPI** — HTTP APIs
- **asyncio** — streaming patterns in services (see API `/ready` for async Redis)
- **Docker & Compose** — local runtime
- **Redis** — local stream / pub-sub stand-in for Kinesis-style pipelines
- **LocalStack** — AWS API mocking (S3, SQS, SNS, DynamoDB in compose)

## Layout

```
aimme/
  services/
    ingestion/    # data ingestion (requirements only for now)
    processor/    # stream processing
    ai_service/   # AI workloads
    api/          # FastAPI gateway (runnable)
  shared/         # shared Python package
  infra/          # placeholder for AWS CDK / IaC later
  docker-compose.yml
```

## Prerequisites

- Docker Engine and Docker Compose v2
- (Optional) Python 3.11 for running the API outside Docker

## Run locally (Docker)

From the repository root:

```bash
docker compose up --build
```

- API: [http://localhost:8000](http://localhost:8000) — OpenAPI docs at [http://localhost:8000/docs](http://localhost:8000/docs)
- Redis (from host): `localhost:6380` → container `6379` (avoids colliding with a system Redis on `6379`)
- LocalStack: `http://localhost:4566` (set `AWS_ENDPOINT_URL` / boto3 `endpoint_url` to this in app code)

Health checks:

- `GET /health` — process up
- `GET /ready` — async Redis connectivity (uses `REDIS_URL`)

## Run API without Docker (dev)

```bash
cd services/api
python3.11 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export REDIS_URL=redis://localhost:6380/0
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Start Redis (and optionally LocalStack) with Compose in another terminal:

```bash
docker compose up redis localstack
```

## Environment variables (API container)

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | Async Redis client (default in compose: `redis://redis:6379/0`) |
| `AWS_ENDPOINT_URL` | Point boto3/SDK at LocalStack |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Dummy creds for LocalStack |
| `AWS_DEFAULT_REGION` | e.g. `us-east-1` |

## Next steps

- Wire ingestion/processor to Redis streams or pub/sub.
- Add boto3 clients using `AWS_ENDPOINT_URL` against LocalStack for S3/SQS/etc.
- Add CDK or Terraform under `infra/` when ready.
