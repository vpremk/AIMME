import type { NextApiRequest, NextApiResponse } from "next";

function isLoopbackUrl(base: string): boolean {
  try {
    const u = new URL(base);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Server-side upstream for API routes. Prefer `AIMME_API_BASE_URL` on Vercel so
 * `NEXT_PUBLIC_API_URL` can stay `http://localhost:8000` for local dev without
 * breaking production (Vercel cannot reach your laptop).
 */
export function getUpstreamBase(): string | null {
  const base =
    process.env.AIMME_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV !== "production" ? "http://localhost:8000" : "");
  const trimmed = base.replace(/\/+$/, "");
  if (!trimmed) return null;
  if (process.env.NODE_ENV === "production" && isLoopbackUrl(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Headers for upstream API Gateway (optional `AIMME_API_KEY` when usage plan requires it). */
export function getUpstreamHeaders(jsonBody = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (jsonBody) headers["Content-Type"] = "application/json";
  const apiKey = process.env.AIMME_API_KEY;
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}

export function upstreamConfigErrorMessage(): string {
  const raw = (
    process.env.AIMME_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    ""
  ).replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production" && raw && isLoopbackUrl(raw)) {
    return (
      "Upstream URL points to localhost; Vercel cannot reach it. " +
      "Set AIMME_API_BASE_URL (recommended) or NEXT_PUBLIC_API_URL to your API Gateway base URL in Vercel."
    );
  }
  return "Missing AIMME_API_BASE_URL or NEXT_PUBLIC_API_URL. Configure the upstream API base.";
}

export async function proxyToAimme(
  req: NextApiRequest,
  res: NextApiResponse,
  targetPath: string,
): Promise<void> {
  const base = getUpstreamBase();
  if (!base) {
    res.status(503).json({
      error: "upstream_not_configured",
      detail: upstreamConfigErrorMessage(),
    });
    return;
  }

  const query = new URLSearchParams();
  Object.entries(req.query).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((x) => query.append(k, x));
    else if (v != null) query.append(k, String(v));
  });

  const url = `${base}${targetPath}${query.toString() ? `?${query}` : ""}`;
  const method = (req.method ?? "GET").toUpperCase();
  const bodyAllowed = !["GET", "HEAD"].includes(method);

  const headers = getUpstreamHeaders(true);
  if (req.headers.authorization) {
    headers.Authorization = req.headers.authorization;
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: bodyAllowed && req.body != null ? JSON.stringify(req.body) : undefined,
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "fetch failed";
    res.status(502).json({ error: "upstream_unreachable", detail });
    return;
  }

  const text = await upstream.text();
  res.status(upstream.status);
  const reqId = upstream.headers.get("x-request-id");
  if (reqId) res.setHeader("x-request-id", reqId);

  try {
    res.json(JSON.parse(text));
  } catch {
    res.send(text);
  }
}
