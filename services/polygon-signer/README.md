# Polygon signer microservice

Express service that verifies an Auth0 **Imprint API** access token (`AUTH0_IMPRINT_AUDIENCE` + `imprint:alert` or `AUTH0_IMPRINT_PERMISSION`), then submits `logHazard` on Polygon using `POLYGON_PRIVATE_KEY`.

AIMME’s Next.js app calls this via `TOKEN_VAULT_URL` when `POLYGON_SIGNING_MODE=vault` (see `web/lib/server/hazard-vault-client.ts`).

## API

- `GET /health` — liveness
- `POST /v1/sign/hazard` — JSON body:
  - `auth0_access_token` (required)
  - `asset`, `riskLevel`, `timestamp` (required)
  - `idempotencyKey` (required) — must equal `ASSET:RISK:floor(timestamp)` (same as `hazardKey` in the web app)
  - `aiConfidence` (optional, 0–1; converted to contract bps)

If `SIGNER_SERVICE_API_KEY` is set, requests must include `Authorization: Bearer <SIGNER_SERVICE_API_KEY>`.

## Run locally

```bash
cd services/polygon-signer
cp .env.example .env
# fill Polygon + Auth0 values
npm install
npm run dev
```

## Docker

```bash
docker build -t polygon-signer .
docker run --env-file .env -p 8787:8787 polygon-signer
```

Production start: `npm run build` then `npm start` (runs `node dist/index.js`).
