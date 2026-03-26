import "dotenv/config";
import express from "express";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { createRemoteJWKSet, jwtVerify } from "jose";

const ABI = [
  "function logHazard(string asset,string riskLevel,uint256 timestamp,uint256 aiConfidenceBps) returns (uint256)",
] as const;

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

function parseChainId(): number {
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

function hazardKey(asset: string, riskLevel: string, timestamp: number): string {
  return `${asset}:${riskLevel}:${Math.floor(timestamp)}`;
}

function getClient() {
  const rpc = env("POLYGON_RPC_URL");
  const pk = env("POLYGON_PRIVATE_KEY");
  const address = env("HAZARD_REGISTRY_ADDRESS");
  if (!rpc || !pk || !address) {
    throw new Error(
      "Missing POLYGON_RPC_URL / POLYGON_PRIVATE_KEY / HAZARD_REGISTRY_ADDRESS",
    );
  }
  const provider = new JsonRpcProvider(rpc);
  const signer = new Wallet(pk, provider);
  const contract = new Contract(address, ABI, signer);
  return { contract };
}

function hasImprintPermission(
  payload: { permissions?: unknown; scope?: unknown },
  requiredPerm: string,
): boolean {
  const perms = payload.permissions;
  if (Array.isArray(perms) && perms.some((p) => String(p) === requiredPerm)) {
    return true;
  }
  const scope = payload.scope;
  if (typeof scope === "string") {
    return scope.split(/\s+/).includes(requiredPerm);
  }
  return false;
}

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.post("/v1/sign/hazard", async (req, res) => {
  const serviceKey = env("SIGNER_SERVICE_API_KEY");
  if (serviceKey) {
    const auth = req.headers.authorization;
    const m = typeof auth === "string" ? /^Bearer\s+(.+)$/i.exec(auth) : null;
    if (!m || m[1] !== serviceKey) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  const issuerRaw = env("AUTH0_ISSUER_BASE_URL").replace(/\/+$/, "");
  const audience = env("AUTH0_IMPRINT_AUDIENCE");
  const requiredPerm = env("AUTH0_IMPRINT_PERMISSION") || "imprint:alert";
  if (!issuerRaw || !audience) {
    return res.status(503).json({ error: "auth_not_configured" });
  }

  const body = req.body as Record<string, unknown> | null | undefined;
  const token =
    typeof body?.auth0_access_token === "string" ? body.auth0_access_token : "";
  const asset = String(body?.asset || "").trim().toUpperCase();
  const riskLevel =
    String(body?.riskLevel || "").trim().toUpperCase() || "HIGH";
  const timestamp = Number(body?.timestamp);
  const aiConfidence =
    body?.aiConfidence == null ? undefined : Number(body.aiConfidence);
  const idempotencyKey =
    typeof body?.idempotencyKey === "string" ? body.idempotencyKey : "";

  if (!token || !asset || !Number.isFinite(timestamp)) {
    return res.status(400).json({ error: "invalid_body" });
  }

  const expectedKey = hazardKey(asset, riskLevel, timestamp);
  if (!idempotencyKey || idempotencyKey !== expectedKey) {
    return res.status(400).json({ error: "invalid_idempotency_key" });
  }

  let payload: { permissions?: unknown; scope?: unknown };
  try {
    const jwks = createRemoteJWKSet(
      new URL(`${issuerRaw}/.well-known/jwks.json`),
    );
    const verified = await jwtVerify(token, jwks, {
      issuer: `${issuerRaw}/`,
      audience,
    });
    payload = verified.payload;
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }

  if (!hasImprintPermission(payload, requiredPerm)) {
    return res.status(403).json({ error: "missing_imprint_permission" });
  }

  const key = expectedKey;
  const chainId = parseChainId();
  const explorerBase = txExplorerBase(chainId);

  try {
    const { contract } = getClient();
    const tx = await contract.logHazard(
      asset,
      riskLevel,
      Math.floor(timestamp),
      toConfidenceBps(aiConfidence),
    );
    const txHash = String(tx.hash);
    const initial = {
      key,
      txHash,
      status: "submitted" as const,
      chainId,
      explorerUrl: `${explorerBase}${txHash}`,
      updatedAt: Date.now(),
    };
    const receipt = await tx.wait();
    const confirmed = {
      ...initial,
      status: receipt?.status === 1 ? ("confirmed" as const) : ("failed" as const),
      updatedAt: Date.now(),
    };
    return res.status(200).json(confirmed);
  } catch (err) {
    const lastError = err instanceof Error ? err.message : "unknown error";
    return res.status(200).json({
      key,
      txHash: "",
      status: "failed" as const,
      chainId,
      explorerUrl: "",
      lastError,
      updatedAt: Date.now(),
    });
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`polygon-signer listening on :${port}`);
});
