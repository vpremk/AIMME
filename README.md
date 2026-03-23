# AIMME

Local-first scaffold for a real-time AI capital markets platform with both:

- Docker-based local microservices
- AWS CDK serverless deployment (CloudFormation)

## Stack

- **Python 3.11**
- **FastAPI** — HTTP APIs
- **asyncio** — streaming patterns in services (see API `/ready` for async Redis)
- **Docker & Compose** — local runtime
- **Redis** — local stream / pub-sub stand-in for Kinesis-style pipelines
- **LocalStack** — AWS API mocking (S3, SQS, SNS, DynamoDB in compose)

## Serverless (AWS CDK / CloudFormation)

The `infra/` app deploys `AimmeServerlessStack` (CloudFormation) with:

- **DynamoDB** table `SignalsTable`
  - PK: `asset` (string)
  - SK: `timestamp` (number)
  - Billing: `PAY_PER_REQUEST`
  - Streams: `NEW_IMAGE`
- **SNS** topic `AlertsTopic`
- **Lambdas** (Python 3.12, `infra/lambda_functions/`)
  - `lambda_ingestion.handler` (`GET/POST /signals`)
  - `lambda_processing.handler` (DynamoDB stream + optional `POST /process`)
  - `lambda_alerts.handler` (DynamoDB stream + optional `POST /alert`)
- **API Gateway REST API**
  - `GET /signals`
  - `POST /signals`
  - `POST /process` (manual test helper)
  - `POST /alert` (manual test helper)

### Deploy serverless stack

From `infra/`:

```bash
npx cdk deploy AimmeServerlessStack
```

Optional CDK context:

```bash
npx cdk deploy AimmeServerlessStack \
  -c useGroq=true \
  -c groqApiKey=YOUR_GROQ_KEY \
  -c alertEmail=you@example.com
```

After deployment, read these CloudFormation outputs:

- `RestApiUrl` (base URL)
- `SignalsUrl`
- `ProcessTestUrl`
- `AlertTestUrl`
- `SignalsTableName`
- `AlertsTopicArn`

`NEXT_PUBLIC_API_URL` for the frontend should be `RestApiUrl` with no trailing slash.

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

## API testing (serverless)

### Base URL

Set:

```bash
export API_BASE="https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/prod"
```

Use the value from CloudFormation `RestApiUrl` (remove trailing slash if present).

### curl examples

Get signals:

```bash
curl -sS "$API_BASE/signals?limit=50" | jq
```

Ingest a raw event:

```bash
curl -sS -X POST "$API_BASE/signals" \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "AAPL",
    "payload": {
      "price": 190.25,
      "volume": 1500
    }
  }' | jq
```

Manual processing test:

```bash
curl -sS -X POST "$API_BASE/process" \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "AAPL",
    "timestamp": 1730000000000,
    "type": "raw",
    "payload": {
      "price": 100,
      "volume": 2000
    }
  }' | jq
```

Manual alert test:

```bash
curl -sS -X POST "$API_BASE/alert" \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "AAPL",
    "timestamp": 1730000000001,
    "type": "signal",
    "signal": "BUY",
    "score": 0.95,
    "anomaly": true
  }' | jq
```

### Postman

Import:

- `infra/postman/AIMME_API.postman_collection.json`
- `infra/postman/AIMME.local.postman_environment.json`

Set `baseUrl` to your API base URL:

`https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/prod`

### Common API Gateway pitfall

If you get:

```json
{"message":"Missing Authentication Token"}
```

it usually means the path/method/stage is wrong (not an auth token issue).
Example: this stack exposes `POST /alert`, not `GET /alerts` by default.

## Next steps

- Wire ingestion/processor to Redis streams or pub/sub.
- Add boto3 clients using `AWS_ENDPOINT_URL` against LocalStack for S3/SQS/etc.
- Add a dedicated `GET /alerts` API route if frontend consumers need it server-side.
