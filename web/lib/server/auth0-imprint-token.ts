import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Access token for the Imprint API audience (RBAC permission e.g. imprint:alert).
 * Returns null if audience unset or Auth0 cannot return a token (re-login may be required).
 */
export async function getImprintAccessToken(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<string | null> {
  const audience = process.env.AUTH0_IMPRINT_AUDIENCE?.trim();
  const perm = String(process.env.AUTH0_IMPRINT_PERMISSION || "imprint:alert").trim();
  if (!audience) return null;
  try {
    const { getAccessToken } = await import("@auth0/nextjs-auth0");
    const { accessToken } = await getAccessToken(req, res, {
      authorizationParams: {
        audience,
        scope: `openid profile email ${perm}`,
      },
    });
    return accessToken ?? null;
  } catch {
    return null;
  }
}

