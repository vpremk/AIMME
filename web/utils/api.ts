/**
 * AIMME API helpers — browser talks only to Next.js same-origin API routes.
 * Next.js API routes proxy to AWS API using server-only env vars.
 */
import type { Candle, HazardTx, MassiveTelemetry, SignalRow, UserMgmtRow } from "./types";
import { normalizeItem } from "./normalize-signal";

export { normalizeItem };

/** Browser-visible base path (keeps upstream hidden from Network tab). */
export function getApiBase(): string {
  return "/api";
}

/** Mask 12-digit AWS account IDs if they appear in UI strings. */
export function maskAwsAccountId(value: string): string {
  return value
    .replace(/\b(\d{4})\d{4}(\d{4})\b/g, "$1****$2")
    .replace(/(arn:aws:[^:]+:[^:]+:)(\d{12})(:)/g, "$1****MASKED****$3");
}

function normalizeUserMgmt(raw: Record<string, unknown>): UserMgmtRow {
  const loginRaw = raw.loginCount;
  let loginCount = 0;
  if (typeof loginRaw === "number" && Number.isFinite(loginRaw)) loginCount = loginRaw;
  else if (typeof loginRaw === "string") {
    const n = Number(loginRaw);
    if (Number.isFinite(n)) loginCount = n;
  }
  return {
    userId: raw.userId != null ? String(raw.userId) : "",
    name: raw.name != null ? String(raw.name) : undefined,
    role: raw.role != null ? String(raw.role) : undefined,
    loginCount,
    termsAccepted: raw.termsAccepted === true,
    createdAt: toNum(raw.createdAt) ?? undefined,
    updatedAt: toNum(raw.updatedAt) ?? undefined,
    lastLoginAt: toNum(raw.lastLoginAt) ?? undefined,
  };
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function authHeaders(): Promise<Record<string, string>> {
  return {};
}

/**
 * GET /admin/users — ops only; proxied to AWS UserManagement table.
 */
export async function fetchAdminUsers(limit = 200): Promise<UserMgmtRow[]> {
  const headers = await authHeaders();
  const res = await fetch(
    `${getApiBase()}/admin/users?limit=${encodeURIComponent(String(limit))}`,
    { cache: "no-store", headers, credentials: "same-origin" },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GET /admin/users failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as { items?: unknown[] };
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((row) =>
    normalizeUserMgmt(row && typeof row === "object" ? (row as Record<string, unknown>) : {}),
  );
}

/**
 * GET /signals — returns Scan results from Ingestion/Lambda.
 */
export async function fetchSignals(limit = 100): Promise<SignalRow[]> {
  const headers = await authHeaders();
  const res = await fetch(
    `${getApiBase()}/signals?limit=${encodeURIComponent(String(limit))}`,
    { cache: "no-store", headers, credentials: "same-origin" },
  );
  if (!res.ok) {
    throw new Error(`GET /signals failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { items?: unknown[] };
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((row) =>
    normalizeItem(row && typeof row === "object" ? (row as Record<string, unknown>) : {}),
  );
}

/**
 * POST /signals — raw event (`type=raw` path in DynamoDB).
 */
export async function postSignal(input: {
  asset: string;
  timestamp?: number;
  price?: number;
  volume?: number;
  userId?: string;
  userName?: string;
  termsAccepted?: boolean;
}): Promise<{ requestId?: string }> {
  const headers = await authHeaders();
  const ts = input.timestamp ?? Date.now();
  const price = input.price ?? 0;
  const volume = input.volume ?? 0;

  const payload: Record<string, number> = {};
  if (input.price != null) payload.price = input.price;
  if (input.volume != null) payload.volume = input.volume;

  const body: Record<string, unknown> = {
    asset: input.asset,
    payload:
      Object.keys(payload).length > 0
        ? payload
        : { price: input.price ?? 0, volume: input.volume ?? 0 },
  };
  if (input.timestamp != null) body.timestamp = input.timestamp;
  body.userId = input.userId ?? "";
  body.userName = input.userName ?? "";
  body.termsAccepted = input.termsAccepted === true;

  // Primary schema: serverless ingestion lambda ({asset, payload, timestamp?})
  let res = await fetch(`${getApiBase()}/signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });

  // Compatibility fallback: local services/api expects a typed SignalCreate body.
  if (res.status === 422) {
    const fallbackSignal = volume >= 1000 ? "BUY" : volume <= 300 ? "SELL" : "HOLD";
    const fallbackBody = {
      asset: input.asset,
      timestamp: ts,
      signal: fallbackSignal,
      confidence:
        fallbackSignal === "BUY"
          ? 0.85
          : fallbackSignal === "SELL"
            ? 0.2
            : 0.55,
      anomaly: volume > 500_000,
      price,
      volume,
      userId: input.userId ?? "",
      userName: input.userName ?? "",
      termsAccepted: input.termsAccepted === true,
    };
    res = await fetch(`${getApiBase()}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(fallbackBody),
      credentials: "same-origin",
    });
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`POST /signals failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as { requestId?: string };
  return { requestId: data.requestId };
}

/**
 * GET /alerts — optional; API may not implement it. Falls back to filtering GET /signals.
 */
export async function fetchAlerts(limit = 30): Promise<SignalRow[]> {
  const headers = await authHeaders();
  const base = getApiBase();
  try {
    const res = await fetch(
      `${base}/alerts?limit=${encodeURIComponent(String(limit))}`,
      { cache: "no-store", headers, credentials: "same-origin" },
    );
    if (res.ok) {
      const data = (await res.json()) as { items?: unknown[] };
      const items = Array.isArray(data.items) ? data.items : [];
      return items.map((row) =>
        normalizeItem(
          row && typeof row === "object" ? (row as Record<string, unknown>) : {},
        ),
      );
    }
  } catch {
    /* fall through */
  }

  const all = await fetchSignals(200);
  return all
    .filter(
      (r) =>
        r.type === "signal" &&
        (r.anomaly ||
          (r.score != null && (r.score >= 0.9 || r.score <= 0.1)) ||
          (r.signal && ["BUY", "SELL", "ANOMALY"].includes(String(r.signal).toUpperCase()))),
    )
    .slice(0, limit);
}

export async function fetchCandles(input: {
  symbol: string;
  multiplier: number;
  timespan: "minute" | "hour" | "day";
  fromIso: string;
  toIso: string;
  limit?: number;
}): Promise<Candle[]> {
  const headers = await authHeaders();
  const q = new URLSearchParams({
    symbol: input.symbol.trim().toUpperCase(),
    multiplier: String(input.multiplier),
    timespan: input.timespan,
    from: input.fromIso,
    to: input.toIso,
    limit: String(input.limit ?? 500),
  });
  const res = await fetch(`${getApiBase()}/market/candles?${q.toString()}`, {
    cache: "no-store",
    headers,
    credentials: "same-origin",
  });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Market data rate limit reached - fallback to cached feed");
    }
    const t = await res.text();
    let extra = t;
    try {
      const j = JSON.parse(t) as { error?: string; detail?: string };
      if (j.detail) extra = j.detail;
      else if (j.error === "massive_not_configured") {
        extra =
          "Massive API key missing — set MARKET_DATA_API_KEY in web/.env.local or Vercel env.";
      }
    } catch {
      /* keep raw */
    }
    throw new Error(`GET /market/candles failed (${res.status}): ${extra}`);
  }
  const data = (await res.json()) as { candles?: unknown[] };
  const raw = Array.isArray(data.candles) ? data.candles : [];
  return raw
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        time: Number(r.time ?? 0),
        open: Number(r.open ?? 0),
        high: Number(r.high ?? 0),
        low: Number(r.low ?? 0),
        close: Number(r.close ?? 0),
        volume: Number(r.volume ?? 0),
      } satisfies Candle;
    })
    .filter((x) => Number.isFinite(x.time) && x.time > 0 && Number.isFinite(x.open));
}

export async function fetchMassiveTelemetry(): Promise<MassiveTelemetry> {
  const headers = await authHeaders();
  const res = await fetch(`${getApiBase()}/admin/market-telemetry`, {
    cache: "no-store",
    headers,
    credentials: "same-origin",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GET /admin/market-telemetry failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as Partial<MassiveTelemetry>;
  return {
    totalRequests: Number(data.totalRequests ?? 0),
    successCount: Number(data.successCount ?? 0),
    upstreamErrorCount: Number(data.upstreamErrorCount ?? 0),
    networkErrorCount: Number(data.networkErrorCount ?? 0),
    lastSymbol: data.lastSymbol ?? null,
    lastStatus: data.lastStatus ?? null,
    lastError: data.lastError ?? null,
    lastLatencyMs: data.lastLatencyMs ?? null,
    lastEventAt: data.lastEventAt ?? null,
  };
}

export async function logHazardOnChain(input: {
  asset: string;
  riskLevel: string;
  timestamp: number;
  aiConfidence?: number;
}): Promise<HazardTx> {
  const headers = await authHeaders();
  const res = await fetch(`${getApiBase()}/hazards/log-onchain`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...headers },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`POST /hazards/log-onchain failed: ${res.status} ${t}`);
  }
  return (await res.json()) as HazardTx;
}

export async function fetchHazardTxStatus(key: string): Promise<HazardTx> {
  const headers = await authHeaders();
  const q = new URLSearchParams({ key });
  const res = await fetch(`${getApiBase()}/hazards/tx-status?${q.toString()}`, {
    method: "GET",
    cache: "no-store",
    headers,
    credentials: "same-origin",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GET /hazards/tx-status failed: ${res.status} ${t}`);
  }
  return (await res.json()) as HazardTx;
}
