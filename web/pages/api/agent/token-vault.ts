import type { NextApiRequest, NextApiResponse } from "next";
import { isEnterprise } from "@/lib/request-auth";
import { verifyToken } from "@/lib/verifyToken";

/**
 * Placeholder for enterprise Token Vault / AI agent credentials.
 * Sandbox users are blocked; enterprise gets a structured stub until vault is wired.
 */
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
      detail: "Token Vault is available for Auth0 (enterprise) workspaces only.",
    });
  }

  const configured = Boolean(process.env.TOKEN_VAULT_URL || process.env.AGENT_SECRETS_KMS_KEY);
  return res.status(200).json({
    configured,
    detail: configured
      ? "Token vault integration stub — connect your vault URL or KMS."
      : "Set TOKEN_VAULT_URL or AGENT_SECRETS_KMS_KEY to activate agent secret injection.",
  });
}
