import type { NextApiRequest, NextApiResponse } from "next";
import { resolveRequestAuth } from "@/lib/request-auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await resolveRequestAuth(req, res);
  if (!auth) {
    return res.status(200).json({ authenticated: false });
  }

  return res.status(200).json({
    authenticated: true,
    source: auth.source,
    uid: auth.uid,
    role: auth.role,
    auth0RoleRaw: auth.source === "auth0_enterprise" ? auth.auth0RoleRaw ?? null : null,
    orgId: auth.orgId ?? null,
    email: auth.email ?? null,
  });
}
