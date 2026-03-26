# Polygon signing service

Small **Node + Express + TypeScript** service that signs **hazard registry** transactions on Polygon. Next.js calls it when `HAZARD_SIGNING_MODE=vault` so **`POLYGON_PRIVATE_KEY` stays off Vercel**.

## Flow

1. **Service auth:** `Authorization: Bearer <HAZARD_SIGNING_SERVICE_API_KEY>` (shared secret with the web app).
2. **User auth:** JSON body includes `auth0AccessToken` (access token for `AUTH0_IMPRINT_AUDIENCE`). The service verifies it with **Auth0 JWKS** (`jose`), then requires **`imprint:alert`** in `permissions` or `scope`, or **`https://aimme.app/can_imprint`** (override via `AUTH0_CAN_IMPRINT_CLAIM`).
3. **On-chain:** `ethers` + `POLYGON_PRIVATE_KEY` calls `logHazard` on `HAZARD_REGISTRY_ADDRESS`.

## Environment

| Variable | Purpose |
|----------|---------|
| `HAZARD_SIGNING_SERVICE_API_KEY` | Bearer token Next.js must send |
| `AUTH0_ISSUER_BASE_URL` | e.g. `https://YOUR_TENANT.us.auth0.com` |
| `AUTH0_IMPRINT_AUDIENCE` | API identifier (must match token `aud`) |
| `AUTH0_IMPRINT_PERMISSION` | Optional; default `imprint:alert` |
| `AUTH0_CAN_IMPRINT_CLAIM` | Optional; default `https://aimme.app/can_imprint` |
| `POLYGON_RPC_URL` | JSON-RPC endpoint |
| `POLYGON_PRIVATE_KEY` | **Only here** for vault deployments |
| `HAZARD_REGISTRY_ADDRESS` | Contract address |
| `POLYGON_CHAIN_ID` | Optional; default `80002` |
| `PORT` | Optional; default `8787` |

## Run locally

```bash
cd services/polygon-signing-service
npm install
# Set env vars (see table below), then:
npm run dev
```

## Docker (optional)

```bash
docker build -t polygon-signing-service .
docker run --env-file .env -p 8787:8787 polygon-signing-service
```

## API

`POST /v1/sign/hazard`

```json
{
  "asset": "BTC",
  "riskLevel": "HIGH",
  "timestamp": 1710000000000,
  "aiConfidence": 0.95,
  "auth0AccessToken": "<user access token>"
}
```

Response: `HazardTxRecord` JSON (`key`, `txHash`, `status`, `chainId`, `explorerUrl`, `updatedAt`).
