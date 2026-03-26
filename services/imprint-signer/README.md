# imprint-signer

Small Node service that verifies an Auth0 **user** access token, then submits `logHazard` on Polygon with a **server-held** private key. Next.js uses `AIMME_IMPRINT_SIGNING_MODE=vault` and calls this service instead of using `POLYGON_PRIVATE_KEY` in the web runtime.

## Environment

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default `8790`) |
| `IMPRINT_SIGNER_API_KEY` | Shared secret; Next.js sends `Authorization: Bearer <same value>` as `AIMME_IMPRINT_SIGNER_API_KEY` (or `TOKEN_VAULT_SERVICE_TOKEN`) |
| `AUTH0_ISSUER_BASE_URL` | e.g. `https://YOUR_TENANT.us.auth0.com` |
| `AUTH0_IMPRINT_AUDIENCE` | Auth0 API identifier (must match access token `aud`) |
| `AUTH0_IMPRINT_PERMISSION` | Default `imprint:alert`; must appear in token `permissions` or `scope` |
| `POLYGON_RPC_URL` | JSON-RPC endpoint |
| `POLYGON_PRIVATE_KEY` | Signer wallet (0x…) |
| `HAZARD_REGISTRY_ADDRESS` | `logHazard` contract |
| `POLYGON_CHAIN_ID` | e.g. `80002` |

## Run locally

```bash
cd services/imprint-signer
npm install
cp .env.example .env   # create and fill values
npm run dev
```

Production:

```bash
npm run build
npm start
```

## HTTP API

`POST /v1/sign/imprint`

- Header: `Authorization: Bearer <IMPRINT_SIGNER_API_KEY>`
- JSON body: `auth0_access_token`, `asset`, `riskLevel`, `timestamp`, `aiConfidenceBps`, `idempotencyKey`

Returns a `HazardTxRecord`-shaped JSON object: `key`, `txHash`, `status`, `chainId`, `explorerUrl`, `updatedAt`.
