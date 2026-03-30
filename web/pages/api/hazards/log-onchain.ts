import type { NextApiRequest, NextApiResponse } from "next";
import { can } from "@/lib/permissions";
import { getHazardTxByKey, logHazardOnChainWithRequest } from "@/lib/server/hazard-onchain";
import { isEnterprise, scopeOrgIdForSignals } from "@/lib/request-auth";
import { getHazardLedgerRecord, putHazardLedgerRecord } from "@/lib/server/hazard-ledger-store";
import { verifyToken } from "@/lib/verifyToken";
import { assertTokenVaultConfig } from "@/lib/server/token-vault";

type Body = {
  asset?: string;
  riskLevel?: string;
  timestamp?: number;
  aiConfidence?: number;
};

function asBody(req: NextApiRequest): Body {
  if (req.body && typeof req.body === "object") return req.body as Body;
  return {};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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
      detail: "On-chain imprints require Auth0 enterprise sign-in.",
    });
  }
  if (!can(auth.role, "signals.read")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const b = asBody(req);
  const asset = String(b.asset || "").trim().toUpperCase();
  const riskLevel = String(b.riskLevel || "").trim().toUpperCase() || "HIGH";
  const timestamp = Number(b.timestamp || Date.now());
  const aiConfidence = b.aiConfidence == null ? undefined : Number(b.aiConfidence);
  if (!asset || !Number.isFinite(timestamp)) {
    return res.status(400).json({ error: "asset and timestamp required" });
  }

  const key = `${asset}:${riskLevel}:${Math.floor(timestamp)}`;
  const orgKey = scopeOrgIdForSignals(auth);
  const existing = getHazardTxByKey(key);
  if (existing) return res.status(200).json(existing);
  const persisted = await getHazardLedgerRecord({ orgKey, key });
  if (persisted) return res.status(200).json(persisted);

  try {
    assertTokenVaultConfig();
    const out = await logHazardOnChainWithRequest(
      { asset, riskLevel, timestamp, aiConfidence },
      req,
      res,
    );
    await putHazardLedgerRecord({ ...out, orgKey });
    return res.status(200).json(out);
  } catch (error) {
    return res.status(502).json({
      error: "onchain_submit_failed",
      detail: error instanceof Error ? error.message : "failed",
    });
  }
}
