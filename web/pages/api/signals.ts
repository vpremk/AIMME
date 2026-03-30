import type { NextApiRequest, NextApiResponse } from "next";
import { can } from "@/lib/permissions";
import { proxyToAimme } from "@/lib/server/api-proxy";
import { resolveRequestAuth, scopeOrgIdForSignals } from "@/lib/request-auth";
import { verifyToken } from "@/lib/verifyToken";

/** GET: public read (analyst-style free trial). POST: enterprise session + trader/write permission only. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const method = (req.method || "GET").toUpperCase();

  if (method === "GET") {
    const sessionAuth = await resolveRequestAuth(req, res);
    const orgId = scopeOrgIdForSignals(sessionAuth);
    req.query = { ...req.query, orgId };
    await proxyToAimme(req, res, "/signals");
    return;
  }

  if (method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let auth;
  try {
    auth = await verifyToken(req, res);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (auth.source !== "auth0_enterprise") {
    return res
      .status(403)
      .json({ error: "ingest_requires_enterprise", detail: "Manual ingest requires enterprise sign-in." });
  }

  if (!can(auth.role, "signals.write")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const orgId = scopeOrgIdForSignals(auth);
  const raw =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const requestedUserId = typeof raw.userId === "string" ? raw.userId.trim() : "";
  const requestedUserName = typeof raw.userName === "string" ? raw.userName.trim() : "";
  const isAgentSubmission =
    requestedUserId === "agent" && requestedUserName.toLowerCase() === "agent";

  const display =
    isAgentSubmission
      ? "Agent"
      : (auth.email && String(auth.email).trim()) ||
        requestedUserName ||
        auth.uid;
  req.body = {
    ...raw,
    orgId,
    userId: isAgentSubmission ? "agent" : auth.uid,
    userName: display,
    termsAccepted: true,
  };

  await proxyToAimme(req, res, "/signals");
}
