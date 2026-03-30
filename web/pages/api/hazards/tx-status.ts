import type { NextApiRequest, NextApiResponse } from "next";
import { can } from "@/lib/permissions";
import { isEnterprise, scopeOrgIdForSignals } from "@/lib/request-auth";
import { getHazardTxByKey } from "@/lib/server/hazard-onchain";
import {
  getHazardLedgerRecord,
  updateHazardLedgerStatus,
} from "@/lib/server/hazard-ledger-store";
import { verifyToken } from "@/lib/verifyToken";

function explorerApiBase(chainId: number): string {
  if (chainId === 137) return "https://api.polygonscan.com/api";
  if (chainId === 80002) return "https://api-amoy.polygonscan.com/api";
  return "https://api-amoy.polygonscan.com/api"; // Amoy default
}

async function receiptStatusFromPolygonscan(
  base: string,
  scanKey: string,
  txHash: string,
): Promise<"confirmed" | "failed" | "pending"> {
  const url =
    `${base}?module=transaction&action=gettxreceiptstatus` +
    `&txhash=${encodeURIComponent(txHash)}&apikey=${encodeURIComponent(scanKey)}`;
  const r = await fetch(url, { cache: "no-store" });
  const j = (await r.json()) as { status?: string; result?: { status?: string } };
  const receiptStatus = j?.result?.status;
  return receiptStatus === "1" ? "confirmed" : receiptStatus === "0" ? "failed" : "pending";
}

/** Receipt status via standard JSON-RPC (no Polygonscan API key required). */
async function receiptStatusFromRpc(
  rpcUrl: string,
  txHash: string,
): Promise<"confirmed" | "failed" | "pending"> {
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [txHash],
    }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
  const j = (await r.json()) as { error?: { message?: string }; result?: { status?: string } | null };
  if (j.error?.message) throw new Error(j.error.message);
  const receipt = j.result;
  if (receipt == null) return "pending";
  const st = receipt.status ?? "";
  if (st === "0x1" || st === "0x01" || st === "1") return "confirmed";
  if (st === "0x0" || st === "0x00" || st === "0") return "failed";
  return "pending";
}

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
      detail: "Transaction status for on-chain hazards is available to enterprise users only.",
    });
  }
  if (!can(auth.role, "signals.read")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const key = String(req.query.key || "");
  if (!key) return res.status(400).json({ error: "key required" });

  const orgKey = scopeOrgIdForSignals(auth);
  const mem = getHazardTxByKey(key);
  const persisted = await getHazardLedgerRecord({ orgKey, key });
  const tx = persisted ?? mem;
  if (!tx || !tx.txHash) return res.status(404).json({ error: "tx not found" });

  const scanKey = String(process.env.POLYGONSCAN_API_KEY || "").trim();
  const rpcUrl = String(process.env.POLYGON_RPC_URL || "").trim();

  try {
    if (scanKey) {
      // Try the tx's chainId first, but also fallback to the other Polygon network.
      // This avoids showing "pending" forever when POLYGON_CHAIN_ID was misconfigured.
      const primary = explorerApiBase(tx.chainId);
      const bases = Array.from(new Set([primary, explorerApiBase(137), explorerApiBase(80002)]));
      const statuses = await Promise.all(
        bases.map((b) => receiptStatusFromPolygonscan(b, scanKey, tx.txHash).catch(() => "pending")),
      );
      const explorerStatus = statuses.includes("failed")
        ? "failed"
        : statuses.includes("confirmed")
          ? "confirmed"
          : "pending";
      if (persisted && explorerStatus !== persisted.status && (explorerStatus === "confirmed" || explorerStatus === "failed")) {
        await updateHazardLedgerStatus({ orgKey, key, status: explorerStatus, updatedAt: Date.now() });
      }
      return res.status(200).json({ ...tx, explorerStatus });
    }

    if (rpcUrl) {
      const explorerStatus = await receiptStatusFromRpc(rpcUrl, tx.txHash);
      if (persisted && explorerStatus !== persisted.status && (explorerStatus === "confirmed" || explorerStatus === "failed")) {
        await updateHazardLedgerStatus({ orgKey, key, status: explorerStatus, updatedAt: Date.now() });
      }
      return res.status(200).json({ ...tx, explorerStatus });
    }

    return res.status(200).json({
      ...tx,
      explorerStatus: "unknown_no_api_key",
      explorerHint:
        "Set POLYGON_RPC_URL (for imprints) or POLYGONSCAN_API_KEY to resolve transaction status.",
    });
  } catch (error) {
    return res.status(200).json({
      ...tx,
      explorerStatus: "unknown_error",
      explorerError: error instanceof Error ? error.message : "failed",
    });
  }
}
