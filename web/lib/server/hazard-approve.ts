import { Interface } from "ethers";
import type { NextApiRequest, NextApiResponse } from "next";
import { getImprintAccessToken } from "@/lib/server/auth0-imprint-token";
import { requestTokenVaultSignature } from "@/lib/server/token-vault";

export type HazardInput = {
  asset: string;
  riskLevel: string;
  timestamp: number;
  aiConfidence?: number;
};

export type HazardTxRecord = {
  key: string;
  txHash: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  chainId: number;
  explorerUrl: string;
  lastError?: string;
  updatedAt: number;
};

const ABI = [
  "function logHazard(string asset,string riskLevel,uint256 timestamp,uint256 aiConfidenceBps) returns (uint256)",
] as const;

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

function parseChainIdFallback(): number {
  const raw = env("POLYGON_CHAIN_ID");
  const n = Number(raw || 80002);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 80002;
}

function txExplorerBase(chainId: number): string {
  if (chainId === 137) return "https://polygonscan.com/tx/";
  if (chainId === 80002) return "https://amoy.polygonscan.com/tx/";
  return "https://amoy.polygonscan.com/tx/";
}

function toConfidenceBps(input?: number): number {
  if (input == null || !Number.isFinite(input)) return 0;
  const pct = Math.max(0, Math.min(1, input));
  return Math.round(pct * 10000);
}

export function hazardKey(input: HazardInput): string {
  return `${input.asset}:${input.riskLevel}:${Math.floor(input.timestamp)}`;
}

export async function approveHazardViaTokenVault(
  input: HazardInput,
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<HazardTxRecord> {
  const registry = env("HAZARD_REGISTRY_ADDRESS");
  if (!registry) throw new Error("HAZARD_REGISTRY_ADDRESS is required");

  const accessToken = await getImprintAccessToken(req, res);
  if (!accessToken) {
    throw new Error(
      "Missing imprint access token (set AUTH0_IMPRINT_AUDIENCE and re-login with imprint permission)",
    );
  }

  const chainId = parseChainIdFallback();
  const iface = new Interface([...ABI]);
  const data = iface.encodeFunctionData("logHazard", [
    input.asset,
    input.riskLevel,
    BigInt(Math.floor(input.timestamp)),
    BigInt(toConfidenceBps(input.aiConfidence)),
  ]);

  const key = hazardKey(input);
  const out = await requestTokenVaultSignature({
    auth0_access_token: accessToken,
    chainId,
    to: registry,
    data,
    idempotencyKey: key,
  });

  const explorerBase = txExplorerBase(out.chainId ?? chainId);
  return {
    key,
    txHash: out.txHash,
    status: out.status === "confirmed" ? "confirmed" : out.status === "failed" ? "failed" : "submitted",
    chainId: out.chainId ?? chainId,
    explorerUrl: `${explorerBase}${out.txHash}`,
    lastError: out.lastError,
    updatedAt: Date.now(),
  };
}

