import type { NextApiRequest, NextApiResponse } from "next";
import { FirebaseAdminConfigError, getAdminAuth } from "@/lib/firebase-admin";
import { getUpstreamBase, getUpstreamHeaders } from "@/lib/server/api-proxy";
import { normalizeRole } from "@/lib/permissions";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function buildCookie(name: string, value: string, maxAgeSec: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

function clearCookie(name: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const idToken = String(req.body?.idToken || "");
  if (!idToken) return res.status(400).json({ error: "idToken required" });
  const incrementLogin = Boolean(req.body?.incrementLogin);
  const sandboxRaw = req.body?.sandboxRole;
  const sandboxRole =
    sandboxRaw == null || sandboxRaw === "" ? null : normalizeRole(sandboxRaw);

  let adminAuth;
  try {
    adminAuth = getAdminAuth();
  } catch (error) {
    if (error instanceof FirebaseAdminConfigError) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(500).json({ error: "Firebase Admin initialization failed" });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: MAX_AGE_MS,
    });

    const maxAge = Math.floor(MAX_AGE_MS / 1000);
    const cookies: string[] = [
      buildCookie("aimme_session", sessionCookie, maxAge),
    ];

    if (sandboxRole) {
      cookies.push(buildCookie("aimme_tier", "firebase_sandbox", maxAge));
      cookies.push(buildCookie("aimme_sandbox_role", sandboxRole, maxAge));
    } else {
      cookies.push(clearCookie("aimme_tier"));
      cookies.push(clearCookie("aimme_sandbox_role"));
    }

    res.setHeader("Set-Cookie", cookies);

    if (incrementLogin) {
      const base = getUpstreamBase();
      if (base) {
        const url = `${base}/admin/users/login`;
        try {
          await fetch(url, {
            method: "POST",
            headers: getUpstreamHeaders(true),
            body: JSON.stringify({ userId: decoded.uid }),
            cache: "no-store",
          });
        } catch {
          /* best-effort */
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
