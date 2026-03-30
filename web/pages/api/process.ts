import type { NextApiRequest, NextApiResponse } from "next";
import { can } from "@/lib/permissions";
import { verifyToken } from "@/lib/verifyToken";
import { proxyToAimme } from "@/lib/server/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let auth;
  try {
    auth = await verifyToken(req, res);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!can(auth.role, "process.write")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await proxyToAimme(req, res, "/process");
}
