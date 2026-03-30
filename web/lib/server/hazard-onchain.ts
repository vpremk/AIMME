import { Contract, JsonRpcProvider, Wallet } from "ethers";
import type { NextApiRequest, NextApiResponse } from "next";
import { approveHazardViaTokenVault, hazardKey as hazardKeyVault, type HazardInput } from "@/lib/server/hazard-approve";
import { isTokenVaultSigningMode } from "@/lib/server/token-vault";

const ABI = [
  "function logHazard(string asset,string riskLevel,uint256 timestamp,uint256 aiConfidenceBps) returns (uint256)",
] as const;

export type { HazardInput } from "@/lib/server/hazard-approve";

type HazardTxRecord = {
  key: string;
  txHash: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  chainId: number;
  explorerUrl: string;
  lastError?: string;
  updatedAt: number;
};

const txStore = new Map<string, HazardTxRecord>();

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

function parseChainId(): number {
  const raw = env("POLYGON_CHAIN_ID");
  const n = Number(raw || 80002); // Amoy default
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

function hazardKey(input: HazardInput): string {
  return hazardKeyVault(input);
}

function getClient() {
  const rpc = env("POLYGON_RPC_URL");
  const pk = env("POLYGON_PRIVATE_KEY");
  const address = env("HAZARD_REGISTRY_ADDRESS");
  if (!rpc || !pk || !address) {
    throw new Error(
      "Missing POLYGON_RPC_URL / POLYGON_PRIVATE_KEY / HAZARD_REGISTRY_ADDRESS env vars",
    );
  }
  const provider = new JsonRpcProvider(rpc);
  const signer = new Wallet(pk, provider);
  const contract = new Contract(address, ABI, signer);
  return { contract, provider };
}

async function submitOnce(input: HazardInput): Promise<HazardTxRecord> {
  const key = hazardKey(input);
  const { contract, provider } = getClient();
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId) || parseChainId();
  const explorerBase = txExplorerBase(chainId);

  const tx = await contract.logHazard(
    input.asset,
    input.riskLevel,
    Math.floor(input.timestamp),
    toConfidenceBps(input.aiConfidence),
  );
  const txHash = String(tx.hash);
  const initial: HazardTxRecord = {
    key,
    txHash,
    status: "submitted",
    chainId,
    explorerUrl: `${explorerBase}${txHash}`,
    updatedAt: Date.now(),
  };
  txStore.set(key, initial);
  // Do not block API response on chain confirmation; update in-memory status asynchronously.
  void tx
    .wait()
    .then((receipt: { status?: number } | null) => {
      const finalized: HazardTxRecord = {
        ...initial,
        status: receipt?.status === 1 ? "confirmed" : "failed",
        updatedAt: Date.now(),
      };
      txStore.set(key, finalized);
    })
    .catch((error: unknown) => {
      const failed: HazardTxRecord = {
        ...initial,
        status: "failed",
        lastError: error instanceof Error ? error.message : "tx confirmation failed",
        updatedAt: Date.now(),
      };
      txStore.set(key, failed);
    });
  return initial;
}

export async function logHazardOnChain(input: HazardInput): Promise<HazardTxRecord> {
  const key = hazardKey(input);
  const existing = txStore.get(key);
  if (existing && existing.status !== "failed") return existing;

  if (isTokenVaultSigningMode()) {
    throw new Error("Vault signing requires req/res context; call logHazardOnChainWithRequest()");
  }

  let lastError = "";
  const maxAttempts = 3;
  for (let i = 1; i <= maxAttempts; i += 1) {
    try {
      return await submitOnce(input);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
      await new Promise((r) => setTimeout(r, 300 * i));
    }
  }

  const failed: HazardTxRecord = {
    key,
    txHash: "",
    status: "failed",
    chainId: parseChainId(),
    explorerUrl: "",
    lastError,
    updatedAt: Date.now(),
  };
  txStore.set(key, failed);
  throw new Error(lastError || "failed to submit on-chain hazard");
}

export function getHazardTxByKey(key: string): HazardTxRecord | null {
  return txStore.get(key) ?? null;
}

export async function logHazardOnChainWithRequest(
  input: HazardInput,
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<HazardTxRecord> {
  const key = hazardKey(input);
  const existing = txStore.get(key);
  if (existing && existing.status !== "failed") return existing;

  if (isTokenVaultSigningMode()) {
    const rec = await approveHazardViaTokenVault(input, req, res);
    txStore.set(key, rec);
    return rec;
  }

  return await logHazardOnChain(input);
}
