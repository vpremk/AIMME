import type { NextApiRequest, NextApiResponse } from "next";
import { buildAuth0RedirectUri } from "@/lib/auth0-redirect-uri";

/**
 * Lazy-load @auth0/nextjs-auth0 inside the handler so it is never evaluated at
 * module-init time. The library (v3) internally imports `next/headers`, which
 * reads from an async request context that doesn't exist until a real request
 * arrives. Top-level evaluation therefore throws:
 *   "Cannot read properties of undefined (reading 'headers')"
 */
export default async function auth(req: NextApiRequest, res: NextApiResponse) {
  const { handleAuth, handleCallback, handleLogin } = await import("@auth0/nextjs-auth0");

  const run = handleAuth({
    login: async (loginReq: NextApiRequest, loginRes: NextApiResponse) => {
      const redirectUri = buildAuth0RedirectUri(loginReq);
      await handleLogin(loginReq, loginRes, {
        authorizationParams: {
          scope: "openid profile email",
          response_type: "code",
          redirect_uri: redirectUri,
        },
      });
    },
    callback: async (cbReq: NextApiRequest, cbRes: NextApiResponse) => {
      const redirectUri = buildAuth0RedirectUri(cbReq);
      await handleCallback(cbReq, cbRes, { redirectUri });
    },
    onError(_req, errRes, error: unknown) {
      console.error("[auth0]", error);
      const err = error as { status?: number; message?: string };
      const status =
        typeof err.status === "number" && err.status >= 400 && err.status < 600
          ? err.status
          : 400;
      errRes.status(status).end(err.message ?? "Authentication error");
    },
  });

  await run(req, res);
}
