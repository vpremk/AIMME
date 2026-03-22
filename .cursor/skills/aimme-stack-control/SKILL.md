---
name: aimme-stack-control
description: Stops and starts AIMME backend (Docker Compose) and frontend (Next.js web app). Use when the user wants to run, shut down, or restart the full stack, free ports, or switch between Docker and local uvicorn.
---

# AIMME stack: stop and start

Assume repository root is `aimme/` (where `docker-compose.yml` and `web/` live).

## Backend (Docker Compose)

**Start all defined services** (redis, localstack, ingestion, processor, ai_service, api):

```bash
cd aimme
docker compose up -d
```

**Start only core pipeline** (skip localstack if needed — omit from command by listing services):

```bash
cd aimme
docker compose up -d redis ingestion processor ai_service api
```

**Stop and remove containers** (keeps named volumes like `api-data`, `localstack-data`):

```bash
cd aimme
docker compose down
```

**Stop and remove containers + volumes** (wipes API SQLite and LocalStack data — use only if intentional):

```bash
docker compose down -v
```

**Check what is running:**

```bash
docker compose ps
```

**Ports (host):** API `8000`, AI `8001`, Redis `6380`, LocalStack `4566`. If `uvicorn` fails with “address already in use” on `8000`, either run `docker compose stop api` or use another port for local Python.

## Frontend (Next.js)

**Start dev server** (default [http://localhost:3000](http://localhost:3000)):

```bash
cd aimme/web
npm install
npm run dev
```

**Stop:** `Ctrl+C` in the terminal running `npm run dev`.

**API URL:** Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `web/.env.local` if the API is not on localhost:8000.

## Full stack (typical demo)

1. From repo root: `docker compose up -d`
2. In another terminal: `cd web && npm run dev`
3. Open the app at port 3000; API docs at `http://localhost:8000/docs`

## Local backend without Docker (optional)

Requires Redis (e.g. `docker compose up -d redis`) and a venv with `services/*/requirements.txt` installed. Use the **project venv** and **`python -m uvicorn`** so dependencies resolve (avoid Homebrew’s global `uvicorn`):

```bash
cd aimme/services/api
../../venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8002
```

Use port `8002` if Docker already binds `8000`.
