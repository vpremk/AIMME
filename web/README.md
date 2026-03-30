# AIMME Web

Next.js dashboard for AIMME signals with a same-origin API proxy.

## Environment

- `AIMME_API_BASE_URL` (recommended for Vercel/server): AWS API Gateway base URL, no trailing slash
- `NEXT_PUBLIC_API_URL` (local dev): local API URL, typically `http://localhost:8000`
- `MARKET_DATA_API_KEY` (server-only): Massive(Previously Massive.io) API key for candlestick market data route
- `POLYGON_RPC_URL` (server-only): Polygon Amoy RPC endpoint (Alchemy recommended)
- `POLYGON_PRIVATE_KEY` (server-only): signer wallet private key for hazard logging
- `HAZARD_REGISTRY_ADDRESS` (server-only): deployed `HazardRegistry` contract address
- `POLYGON_CHAIN_ID` (server-only): `80002` for Amoy or `137` for Polygon mainnet
- `POLYGONSCAN_API_KEY` (optional server-only): explorer status lookups

Example:

```bash
AIMME_API_BASE_URL=https://xxxx.execute-api.us-east-1.amazonaws.com/prod
NEXT_PUBLIC_API_URL=http://localhost:8000
MARKET_DATA_API_KEY=your_massive_api_key
POLYGON_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
POLYGON_PRIVATE_KEY=0x...
HAZARD_REGISTRY_ADDRESS=0x...
POLYGON_CHAIN_ID=80002
POLYGONSCAN_API_KEY=...
```

## Dev

```bash
npm install
npm run dev
```

The browser calls `/api/*`; Next.js API routes forward to AWS.

## Proxy routes

- `GET/POST /api/signals` → `/signals`
- `GET /api/alerts` → `/alerts`
- `POST /api/process` → `/process`
- `POST /api/alert` → `/alert`
- `GET /api/market/candles` → Massive(Previously Massive.io) aggregates API for real-time OHLC candles
- `POST /api/hazards/log-onchain` → submit hazard event to `HazardRegistry` on Polygon
- `GET /api/hazards/tx-status?key=...` → fetch hazard tx status (Polygonscan API when configured)
