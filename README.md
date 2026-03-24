#  AI Market Microstructure Engine (AIMME)

AIMME is a product-oriented market intelligence platform for capital markets that ingests market-style events, persists them, transforms them into AI-assisted trading signals, and exposes the results through APIs and a web dashboard.

At a high level:

- **Ingestion** accepts raw event payloads (`asset`, `price`, `volume`, timestamp).
- **Storage** keeps event and signal data in DynamoDB (serverless path) or local stores (dev path).
- **Processing** derives `BUY` / `SELL` / `HOLD` style signals with confidence/anomaly metadata.
- **Alerting** publishes notable events to SNS.
- **UI** visualizes the stream and supports manual signal ingestion for testing.
- **Market data enrichment** uses [Massive](https://massive.com/) (formerly *Polygon.io*, a market-data vendor—**not** the Polygon blockchain) for OHLC aggregates in dashboard candlestick charts.
- **On-chain attestations** use [Polygon PoS](https://polygon.technology/polygon-pos) (via public RPC and **Hardhat** on **Amoy** testnet today) so operators can **imprint** high-severity hazard metadata in `HazardRegistry.sol`, verified on [Polygonscan](https://polygonscan.com/).

**Deployment modes:** Docker for local testing, and AWS serverless for the API plus **Vercel** for the Next.js app—without changing the core ingest → signal → alert flow. Polygon writes are issued from the **web** runtime (`ethers`) against your chosen RPC; AIMME does not run a Polygon validator or bor node.

## Product Objectives

- Deliver near real-time signal visibility for tracked assets.
- Provide a consistent API contract for ingestion, querying, and alert workflows.
- Support multiple deployment modes (local, cloud) with minimal operational drift.
- Keep extensibility for richer strategy logic, model orchestration, and enterprise controls.
- Offer an **optional trust anchor**: immutable, timestamped hazard records on **Polygon** separate from the AWS data plane—useful for audit narratives and partner-facing proof of “what AIMME flagged and when.”

## Business Value

- Faster signal-to-insight cycle for market monitoring and decision support.
- Clear operational boundaries across ingestion, processing, alerting, and presentation.
- **Verifiability:** Polygon on-chain imprints (testnet or mainnet) let compliance and desk leads cross-check alert severity against an explorer-backed transaction hash, without replacing AIMME’s primary AWS/DynamoDB source of truth.
- Revenue-ready packaging across multiple channels:
  - **SaaS subscriptions** tiered plans by assets covered, refresh frequency, and alert volume
  - **API usage billing** (per-request / per-signal pricing for partners and integrators)
  - **Enterprise licensing** private deployment, SSO/RBAC, SLA and support contracts
  - **Data/insight add-ons** premium anomaly feeds, strategy packs, and historical analytics exports

## Stack

- **Python 3.11**
- **FastAPI** — HTTP APIs
- **asyncio** — streaming patterns in services (see API `/ready` for async Redis)
- **Docker & Compose** — local runtime
- **Redis** — local stream / pub-sub stand-in for Kinesis-style pipelines
- **LocalStack** — AWS API mocking (S3, SQS, SNS, DynamoDB in compose)
- **Massive** (formerly *Polygon.io*) — **market data API** for OHLC aggregates in charts (distinct from the Polygon chain below).
- **Polygon PoS & tooling ([polygon.technology](https://polygon.technology/))**
  - **Solidity ^0.8.20** — `HazardRegistry` smart contract (`contracts/`)
  - **Hardhat** — compile/deploy to **Amoy** (chain id **80002**) or **Polygon PoS mainnet** (chain id **137**) using an RPC provider (e.g. Alchemy) and a funded signer
  - **ethers.js v6** (Next.js server routes) — submit `logHazard` transactions; gas paid in **POL** (legacy “MATIC”) on the selected Polygon network
  - **Polygonscan / Amoy Polygonscan** — optional API key for richer tx status in the dashboard

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

**Polygon note (serverless):** Ingest, processing, and SNS alerts stay on AWS. **Writing to Polygon** is handled only in the **`web`** app (server-side API routes + `ethers`). Configure `POLYGON_*` and `HAZARD_REGISTRY_ADDRESS` on Vercel (or `web/.env.local`); the Lambdas do not need chain credentials for the current design.

## Layout

```
aimme/
  services/
    ingestion/    # data ingestion (requirements only for now)
    processor/    # stream processing
    ai_service/   # AI workloads
    api/          # FastAPI gateway (runnable)
  shared/         # shared Python package
  contracts/      # Solidity HazardRegistry + Hardhat (Polygon PoS / Amoy)
  web/            # Next.js UI + /api proxy + Polygon imprint routes
  infra/          # AWS CDK serverless stack
  docker-compose.yml
```

## Prerequisites

- Docker Engine and Docker Compose v2
- (Optional) Python 3.11 for running the API outside Docker
- (Optional) **Node.js 18+** for `web/` (Next.js) and `contracts/` (Hardhat) when building or deploying **`HazardRegistry`** to Polygon

## Run locally (Docker)

From the repository root:

```bash
docker compose up --build
```

- **Polygon imprints** are not part of Compose by default: run `web` (`npm run dev` in `web/`) with `POLYGON_RPC_URL`, `POLYGON_PRIVATE_KEY`, and `HAZARD_REGISTRY_ADDRESS` if you want to test **Imprint on Polygon** against Amoy or mainnet.
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

**Polygon:** This Python API path does not broadcast transactions; on-chain imprints run from **`web`** when you call `/api/hazards/*`.

## Environment variables (API container)

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | Async Redis client (default in compose: `redis://redis:6379/0`) |
| `AWS_ENDPOINT_URL` | Point boto3/SDK at LocalStack |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Dummy creds for LocalStack |
| `AWS_DEFAULT_REGION` | e.g. `us-east-1` |

**Polygon:** These API service variables are unrelated to the blockchain. **Polygon PoS** RPC, deployer/imprint keys, and `HAZARD_REGISTRY_ADDRESS` are configured on the **Next.js** app only (`web/.env.local` or Vercel).

## Web market data (Massive)

The Next.js web app exposes an authenticated same-origin route:

- `GET /api/market/candles`

This route calls **Massive** REST aggregates and returns normalized candle data for the dashboard candlestick graph.

**Not Polygon chain data:** Massive is a **market-data provider** (historically branded *Polygon.io*). It does **not** read your on-chain `HazardRegistry` or Polygon node state. **Polygon PoS** interaction for hazards is only via **`POST /api/hazards/log-onchain`** and the env vars in [On-chain hazard logging (Polygon)](#on-chain-hazard-logging-polygon).

Required server-side web environment variable:

- `MARKET_DATA_API_KEY` — Massive API key (do not use `NEXT_PUBLIC_` prefix)

Recommended web environment setup:

- `AIMME_API_BASE_URL` — API Gateway base URL for server-side proxy routes in Vercel
- `NEXT_PUBLIC_API_URL` — local dev API URL (for example `http://localhost:8000`)

## On-chain hazard logging (Polygon)

AIMME supports immutable hazard writes on Polygon via `contracts/HazardRegistry.sol` and web API routes.

- `POST /api/hazards/log-onchain` logs high-risk hazard events (asset, riskLevel, timestamp, AI confidence)
- `GET /api/hazards/tx-status?key=...` returns on-chain tx state and explorer status
- Alert flow remains non-blocking: failed on-chain writes do not block real-time alert delivery

Required server env vars for on-chain writes:

- `POLYGON_RPC_URL`
- `POLYGON_PRIVATE_KEY`
- `HAZARD_REGISTRY_ADDRESS`
- `POLYGON_CHAIN_ID` (default `80002` for Amoy)

Optional:

- `POLYGONSCAN_API_KEY` (explorer status lookup)

Deploy `HazardRegistry` to Polygon Amoy (Hardhat):

```bash
cd contracts
cp .env.example .env
# set POLYGON_AMOY_RPC_URL and DEPLOYER_PRIVATE_KEY
npm install
npm run compile
npm run deploy:amoy
```

The deploy script auto-prints:

```bash
HAZARD_REGISTRY_ADDRESS=0x...
```

Use that value in `web` env as `HAZARD_REGISTRY_ADDRESS`.

**Mainnet checklist:** Fund the signer with **POL** on Polygon PoS, audit the contract, and treat the imprint wallet as a rate-limited ops key—imprints are **public on-chain** (no secrets in calldata beyond what you pass to `logHazard`).

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

**Polygon:** Serverless `curl` examples above do **not** trigger on-chain imprints; use the **Next.js** deployment with `POST /api/hazards/log-onchain` (authenticated) or extend Lambdas if you need AWS-initiated Polygon txs.

## Roadmap

### Now

- Stabilize ingestion and processing contracts across local and serverless runtimes.
- Expand alert retrieval with a dedicated server-side `GET /alerts` path where required.
- Improve API-level observability (request correlation, structured logs, and error taxonomy).
- Document and test **Polygon Amoy** imprint flows end-to-end (funded signer, contract address, explorer links).

### Next
- Authentication, Authorization, RBAC for Monitoring, Trading, Admin roles
- CI/CD
- Add richer strategy logic and configurable thresholds per asset/profile.
- Integrate managed event backbones (e.g., Redis Streams/Kinesis) for higher throughput.
- Introduce stronger data quality checks and replay-safe processing semantics.
- **Polygon:** durable server-side dedupe/storage for imprint keys (e.g. DynamoDB) across Vercel instances; optional **Polygon PoS mainnet** default; role-gating who may trigger gas spend.

### Later

- Add role-based access controls and enterprise security posture hardening.
- Provide multi-tenant support and per-tenant model/config isolation.
- Extend product analytics with portfolio-level insight and explainability modules.
- **Polygon:** explore **Polygon zkEVM** or formal verification flows if proofs/rollups become a product requirement (current code targets **Polygon PoS** EVM only).
