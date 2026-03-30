import type { NextApiRequest, NextApiResponse } from "next";
import { can } from "@/lib/permissions";
import { recordMassiveEvent } from "@/lib/server/massive-telemetry";
import { isEnterprise, resolveRequestAuth } from "@/lib/request-auth";

type Timespan = "minute" | "hour" | "day";

function readString(input: string | string[] | undefined, fallback: string): string {
  return Array.isArray(input) ? input[0] ?? fallback : input ?? fallback;
}

function parsePositiveInt(input: string, fallback: number): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseTimespan(input: string): Timespan {
  if (input === "minute" || input === "hour" || input === "day") return input;
  return "minute";
}

function parseDateIso(input: string, fallback: Date): Date {
  const dt = new Date(input);
  return Number.isFinite(dt.getTime()) ? dt : fallback;
}

function formatDateOnly(dt: Date): string {
  // Massive aggregates range path accepts YYYY-MM-DD (or unix ts).
  return dt.toISOString().slice(0, 10);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await resolveRequestAuth(req, res);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!isEnterprise(auth) || !can(auth.role, "signals.read")) {
    return res.status(403).json({
      error: "Forbidden",
      detail: "Massive OHLC is available to Auth0 enterprise sessions only.",
    });
  }

  const apiKey = process.env.MARKET_DATA_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "massive_not_configured",
      detail:
        "Add MARKET_DATA_API_KEY to web/.env.local (localhost) or Vercel → Project → Settings → Environment Variables. Use your Massive (Polygon.io) API key.",
    });
  }

  const symbol = readString(req.query.symbol, "AAPL").toUpperCase().replace(/[^A-Z.]/g, "");
  const multiplier = parsePositiveInt(readString(req.query.multiplier, "5"), 5);
  const timespan = parseTimespan(readString(req.query.timespan, "minute"));

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const from = parseDateIso(readString(req.query.from, defaultFrom.toISOString()), defaultFrom);
  const to = parseDateIso(readString(req.query.to, now.toISOString()), now);
  const limit = Math.min(5000, parsePositiveInt(readString(req.query.limit, "500"), 500));

  if (!symbol) {
    return res.status(400).json({ error: "symbol required" });
  }

  const massiveUrl =
    `https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
    `/range/${multiplier}/${timespan}/${formatDateOnly(from)}/${formatDateOnly(to)}` +
    `?adjusted=true&sort=asc&limit=${limit}&apiKey=${encodeURIComponent(apiKey)}`;

  const started = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(massiveUrl, { cache: "no-store" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "fetch failed";
    recordMassiveEvent({
      type: "network_error",
      symbol,
      status: null,
      latencyMs: Date.now() - started,
      error: detail,
    });
    return res.status(502).json({ error: "massive_unreachable", detail });
  }

  const raw = (await upstream.json()) as {
    status?: string;
    results?: Array<{ t: number; o: number; h: number; l: number; c: number; v?: number }>;
    error?: string;
  };

  if (!upstream.ok) {
    recordMassiveEvent({
      type: "upstream_error",
      symbol,
      status: upstream.status,
      latencyMs: Date.now() - started,
      error: raw.error ?? `Massive HTTP ${upstream.status}`,
    });
    return res.status(upstream.status).json({
      error: "massive_error",
      detail: raw.error ?? `Massive HTTP ${upstream.status}`,
    });
  }

  const candles = Array.isArray(raw.results)
    ? raw.results.map((x) => ({
        time: Math.floor(Number(x.t) / 1000),
        open: Number(x.o),
        high: Number(x.h),
        low: Number(x.l),
        close: Number(x.c),
        volume: Number(x.v ?? 0),
      }))
    : [];

  recordMassiveEvent({
    type: "success",
    symbol,
    status: upstream.status,
    latencyMs: Date.now() - started,
  });
  return res.status(200).json({
    symbol,
    multiplier,
    timespan,
    from: from.toISOString(),
    to: to.toISOString(),
    candles,
    count: candles.length,
  });
}
