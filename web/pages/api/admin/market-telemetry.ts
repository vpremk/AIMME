import type { NextApiRequest, NextApiResponse } from "next";
import { can } from "@/lib/permissions";
import { getMassiveTelemetrySnapshot } from "@/lib/server/massive-telemetry";
import { isEnterprise } from "@/lib/request-auth";
import { verifyToken } from "@/lib/verifyToken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let auth;
  try {
    auth = await verifyToken(req, res);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isEnterprise(auth)) {
    return res.status(403).json({
      error: "enterprise_only",
      detail: "Market telemetry is exposed on the enterprise Ops console only.",
    });
  }

  if (!can(auth.role, "admin.users.read")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return res.status(200).json(getMassiveTelemetrySnapshot());
}
