import { timingSafeEqual } from "node:crypto";
import express from "express";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const ABI = [
  "function logHazard(string asset,string riskLevel,uint256 timestamp,uint256 aiConfidenceBps) returns (uint256)",
] as const;

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

function normalizeIssuerBase(base: string): string {
  return base.replace(/\/$/, "");
}

function parseChainId(): number {
  const raw = env("POLYGON_CHAIN_ID");
  const n = Number(raw || 80002);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 80002;
}

function hazardTxExplorerBase(chainId: number): string {
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

const imprintPerm = () => String(process.env.AUTH0_IMPRINT_PERMISSION || "imprint:alert").trim();
const canImprintClaim = () =>
  String(process.env.AUTH0_CAN_IMPRINT_CLAIM || "https://aimme.app/can_imprint").trim();

function hasImprintAuthorization(payload: JWTPayload): boolean {
  const perm = imprintPerm();
  const claimName = canImprintClaim();
  if (payload[claimName] === true) return true;
  const perms = payload.permissions;
  if (Array.isArray(perms) && perms.some((p) => p === perm)) return true;
  const scope =
    typeof payload.scope === "string"
      ? payload.scope.split(/\s+/).filter(Boolean)
      : [];
  return scope.includes(perm);
}

function verifyServiceBearer(authHeader: string | undefined, expected: string): boolean {
  const m = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (!m || !expected) return false;
  const a = Buffer.from(m[1].trim());
  const b = Buffer.from(expected.trim());
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (jwks) return jwks;
  const issuerBase = normalizeIssuerBase(env("AUTH0_ISSUER_BASE_URL"));
  if (!issuerBase) {
    throw new Error("AUTH0_ISSUER_BASE_URL is required");
  }
  const jwksUrl = new URL(`${issuerBase}/.well-known/jwks.json`);
  jwks = createRemoteJWKSet(jwksUrl);
  return jwks;
}

async function verifyUserAccessToken(token: string): Promise<JWTPayload> {
  const issuerBase = normalizeIssuerBase(env("AUTH0_ISSUER_BASE_URL"));
  const audience = env("AUTH0_IMPRINT_AUDIENCE");
  if (!issuerBase || !audience) {
    throw new Error("AUTH0_ISSUER_BASE_URL and AUTH0_IMPRINT_AUDIENCE are required");
  }
  const issuer = `${issuerBase}/`;
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer,
    audience,
  });
  if (!hasImprintAuthorization(payload)) {
    const err = new Error("missing imprint authorization");
    (err as NodeJS.ErrnoException).code = "IMPRINT_FORBIDDEN";
    throw err;
  }
  return payload;
}

async function signHazardOnChain(
  asset: string,
  riskLevel: string,
  timestamp: number,
  aiConfidenceBps: number,
): Promise<{ txHash: string; chainId: number; status: "confirmed" | "failed" }> {
  const rpc = env("POLYGON_RPC_URL");
  const pk = env("POLYGON_PRIVATE_KEY");
  const address = env("HAZARD_REGISTRY_ADDRESS");
  if (!rpc || !pk || !address) {
    throw new Error("POLYGON_RPC_URL, POLYGON_PRIVATE_KEY, and HAZARD_REGISTRY_ADDRESS are required");
  }
  const chainId = parseChainId();
  const provider = new JsonRpcProvider(rpc);
  const signer = new Wallet(pk, provider);
  const contract = new Contract(address, ABI, signer);
  const tx = await contract.logHazard(asset, riskLevel, Math.floor(timestamp), aiConfidenceBps);
  const txHash = String(tx.hash);
  const receipt = await tx.wait();
  return {
    txHash,
    chainId,
    status: receipt?.status === 1 ? "confirmed" : "failed",
  };
}

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/v1/sign/hazard", async (req, res) => {
  const expectedKey = env("HAZARD_SIGNING_SERVICE_API_KEY");
  const authHeader = req.headers.authorization;
  if (!verifyServiceBearer(authHeader, expectedKey)) {
    return res.status(401).json({ error: "unauthorized", detail: "Invalid or missing service API key" });
  }

  const body = req.body as Record<string, unknown>;
  const auth0AccessToken =
    typeof body.auth0AccessToken === "string" ? body.auth0AccessToken.trim() : "";
  const asset = typeof body.asset === "string" ? body.asset.trim() : "";
  const riskLevel = typeof body.riskLevel === "string" ? body.riskLevel.trim() : "";
  const timestamp = Number(body.timestamp);
  const aiConfidence =
    body.aiConfidence == null ? undefined : Number(body.aiConfidence);

  if (!auth0AccessToken || !asset || !riskLevel || !Number.isFinite(timestamp)) {
    return res.status(400).json({
      error: "invalid_body",
      detail: "asset, riskLevel, timestamp, and auth0AccessToken are required",
    });
  }

  try {
    await verifyUserAccessToken(auth0AccessToken);
  } catch (e) {
    const code = e instanceof Error ? (e as NodeJS.ErrnoException).code : undefined;
    if (code === "IMPRINT_FORBIDDEN") {
      return res.status(403).json({
        error: "forbidden",
        detail: "User token lacks imprint permission or scope",
      });
    }
    return res.status(401).json({
      error: "invalid_token",
      detail: e instanceof Error ? e.message : "JWT verification failed",
    });
  }

  const aiBps = toConfidenceBps(aiConfidence);
  let txHash: string;
  let chainId: number;
  let status: "confirmed" | "failed";
  try {
    const out = await signHazardOnChain(asset, riskLevel, timestamp, aiBps);
    txHash = out.txHash;
    chainId = out.chainId;
    status = out.status;
  } catch (e) {
    return res.status(502).json({
      error: "onchain_failed",
      detail: e instanceof Error ? e.message : "transaction failed",
    });
  }

  const key = hazardKey(asset, riskLevel, timestamp);
  const explorerBase = hazardTxExplorerBase(chainId);
  const record = {
    key,
    txHash,
    status,
    chainId,
    explorerUrl: `${explorerBase}${txHash}`,
    updatedAt: Date.now(),
  };
  return res.status(200).json(record);
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.error(`polygon-signing-service listening on :${port}`);
});
