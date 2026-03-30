# AIMME — compile and deploy

Quick reference for building the Next.js app and shipping to production. For full stack run/stop (Docker + dev server), see `.cursor/skills/aimme-stack-control/SKILL.md` and `README.md`.

## Prerequisites

- **Node.js 18+** for `web/`
- **Vercel CLI** for production deploys: `npm i -g vercel` and `vercel login`
- **Env files**: copy `web/.env.local.example` → `web/.env.local` (local); use Vercel project env for production (Auth0, Polygon, Token Vault, `AIMME_API_BASE_URL`, etc.)

## Compile (Next.js `web/`)

From repository root:

```bash
cd web
npm install
npm run build
```

- **`npm run build`** runs `next build` (TypeScript check + optimized production bundle).
- Fix failures locally before deploying; CI/Vercel will fail on the same errors.

**Dev server (not a production compile):**

```bash
cd web
npm run dev
```

**Lint (optional):**

```bash
cd web
npm run lint
```

## Deploy (Vercel production)

Run from `web/` after you are logged into Vercel and linked to the correct project:

```bash
cd web
vercel deploy --prod --yes
```

**Project script** (syncs env from prod file then deploys — only if your repo keeps `web/.env.prod` and the sync script is configured):

```bash
cd web
npm run deploy:vercel
```

Ensure Vercel **Environment Variables** match what the app needs (Auth0, `AIMME_API_BASE_URL`, `MARKET_DATA_API_KEY`, Polygon + hazard ledger, Token Vault when `POLYGON_SIGNING_MODE=vault`, etc.). See `README.md` → *On-chain hazard logging* and *Signing modes*.

## Optional: other build targets

| Target | Command | Notes |
|--------|---------|--------|
| AWS serverless | `cd infra && npx cdk deploy AimmeServerlessStack` | See `README.md` |
| Smart contract | `cd contracts && npm install && npm run compile` / `npm run deploy:amoy` | Polygon Amoy deploy |

## Architecture (Auth0 + Token Vault)

- `architecture/auth0-token-vault-architecture.drawio`

## Related docs

- `README.md` — stack, env vars, Auth0 claims, Token Vault signing modes
- `web/.env.local.example` / `web/.env.prod.example` — variable names (no secrets in git)
