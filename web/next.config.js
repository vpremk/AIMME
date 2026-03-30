/** @type {import('next').NextConfig} */
const path = require("path");
const fs = require("fs");

/**
 * Env files (see `.env.local.example` and `.env.prod.example`):
 * - `.env.local` — copy from `.env.local.example`; Next.js loads it for `next dev` (localhost).
 * - `.env.prod` — copy from `.env.prod.example`; loaded here on production builds only (`next build`,
 *   including Vercel when the file exists). On Vercel, prefer duplicating keys in Project → Settings
 *   → Environment Variables (the file is usually not in the repo).
 * `override` ensures production values win over `.env.local` when both exist during a local `next build`.
 */
const prodEnvPath = path.join(__dirname, ".env.prod");
if (process.env.NODE_ENV === "production" && fs.existsSync(prodEnvPath)) {
  require("dotenv").config({ path: prodEnvPath, override: true });
}

/**
 * OAuth redirect_uri: {AUTH0_BASE_URL}{AUTH0_CALLBACK}. @auth0/nextjs-auth0 reads process.env at runtime.
 * Do NOT put AUTH0_* in `next.config.js` `env` — Next inlines those at build time and breaks Vercel
 * (wrong host from a single deploy’s VERCEL_URL vs your production alias / custom domain).
 * Public URL /auth/callback rewrites to /api/auth/callback; OAuth redirect_uri uses /auth/callback
 * so it matches the path registered in the Auth0 dashboard Allowed Callback URLs.
 */
process.env.AUTH0_CALLBACK = process.env.AUTH0_CALLBACK ?? "/auth/callback";
/**
 * Shims only when unset so Vercel dashboard / .env values always win.
 * Prefer VERCEL_PROJECT_PRODUCTION_URL over VERCEL_URL (stable prod hostname vs per-deployment URL).
 */
const auth0Domain = process.env.AUTH0_DOMAIN?.replace(/^https?:\/\//, "") ?? "";
if (!process.env.AUTH0_ISSUER_BASE_URL && auth0Domain) {
  process.env.AUTH0_ISSUER_BASE_URL = `https://${auth0Domain}`;
}
if (!process.env.AUTH0_BASE_URL) {
  const fromApp = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  const vercelProd =
    process.env.VERCEL_PROJECT_PRODUCTION_URL &&
    `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/+$/, "");
  const vercelDeploy =
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  process.env.AUTH0_BASE_URL = fromApp || vercelProd || vercelDeploy || undefined;
}

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/auth/callback", destination: "/api/auth/callback" }];
  },
  /**
   * Softer COOP so OAuth popups (if any) are not blocked from closing.
   * Firebase Google sign-in uses full-page redirect by default in AuthProvider.
   */
  async headers() {
    /**
     * React’s development build uses eval() for debugging (see react-server-dom
     * “React requires eval() in development mode”). A strict script-src without
     * 'unsafe-eval' breaks `next dev`. Production builds do not use eval for this.
     *
     * If you also set CSP in the Vercel dashboard, merge these rules there or remove
     * the duplicate — multiple CSP headers are combined with AND (stricter wins).
     */
    const isDev = process.env.NODE_ENV === "development";
    const scriptSrc = [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      "https://apis.google.com",
      "https://accounts.google.com",
      "https://www.gstatic.com",
      "https://vercel.live",
      "https://*.auth0.com",
    ].join(" ");

    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://accounts.google.com https://*.google.com https://*.firebaseapp.com https://*.auth0.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Content-Security-Policy",
            value: csp,
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
