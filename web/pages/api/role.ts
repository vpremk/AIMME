import type { NextApiRequest, NextApiResponse } from "next";
import { FirebaseAdminConfigError, getAdminAuth } from "@/lib/firebase-admin";
import { normalizeRole } from "@/lib/permissions";

function readBearer(req: NextApiRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

function readSessionCookie(req: NextApiRequest): string | null {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((x) => x.trim());
  const match = parts.find((x) => x.startsWith("aimme_session="));
  if (!match) return null;
  return decodeURIComponent(match.slice("aimme_session=".length));
}

function readRoleFromBody(req: NextApiRequest): unknown {
  const body = req.body;
  if (body && typeof body === "object" && !Array.isArray(body) && "role" in body) {
    return (body as { role?: unknown }).role;
  }
  return undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const bearer = readBearer(req);
  const session = readSessionCookie(req);
  if (!bearer && !session) {
    return res.status(401).json({ error: "missing_credentials", detail: "Send Authorization: Bearer <idToken> or aimme_session cookie" });
  }

  const role = normalizeRole(readRoleFromBody(req));
  if (!role) return res.status(400).json({ error: "Invalid role" });

  let adminAuth;
  try {
    adminAuth = getAdminAuth();
  } catch (error) {
    if (error instanceof FirebaseAdminConfigError) {
      return res.status(503).json({
        error: "firebase_admin_not_configured",
        detail: error.message,
      });
    }
    return res.status(503).json({ error: "firebase_admin_init_failed" });
  }

  try {
    const decoded = bearer
      ? await adminAuth.verifyIdToken(bearer, true)
      : await adminAuth.verifySessionCookie(session as string, true);
    await adminAuth.setCustomUserClaims(decoded.uid, { role });
    return res.status(200).json({ role });
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}
