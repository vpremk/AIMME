import type { NextApiRequest } from "next";

const DEFAULT_CALLBACK = "/api/auth/callback";

/**
 * Full OAuth redirect_uri for Auth0 (must match an Allowed Callback URL exactly).
 *
 * By default we derive the origin from the incoming request (`Host` / `x-forwarded-*`),
 * so preview deployments and production aliases work without duplicating AUTH0_BASE_URL.
 * Set AUTH0_REDIRECT_URI_FROM_HOST=0 and AUTH0_BASE_URL to use a fixed origin only.
 */
export function buildAuth0RedirectUri(req: NextApiRequest): string {
  const rawPath = process.env.AUTH0_CALLBACK || DEFAULT_CALLBACK;
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

  const fixedOnly =
    process.env.AUTH0_REDIRECT_URI_FROM_HOST === "0" ||
    process.env.AUTH0_REDIRECT_URI_FROM_HOST === "false";

  if (fixedOnly) {
    const base = process.env.AUTH0_BASE_URL?.replace(/\/+$/, "");
    if (!base) {
      throw new Error(
        "AUTH0_BASE_URL is required when AUTH0_REDIRECT_URI_FROM_HOST=0",
      );
    }
    return `${base}${path}`;
  }

  const origin = resolveOriginFromRequest(req);
  return `${origin.replace(/\/+$/, "")}${path}`;
}

function resolveOriginFromRequest(req: NextApiRequest): string {
  const h = req.headers;
  const hostRaw = String(h["x-forwarded-host"] || h.host || "")
    .split(",")[0]
    .trim();

  if (!hostRaw) {
    const fallback = process.env.AUTH0_BASE_URL?.replace(/\/+$/, "");
    if (!fallback) {
      throw new Error(
        "Cannot build Auth0 redirect_uri: missing Host header and AUTH0_BASE_URL",
      );
    }
    return fallback;
  }

  let proto = String(h["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  if (!proto) {
    proto =
      hostRaw.includes("localhost") || hostRaw.startsWith("127.")
        ? "http"
        : "https";
  }

  return `${proto}://${hostRaw}`;
}
