import { Contract, JsonRpcProvider, Wallet } from "ethers";
import express from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

const HAZARD_ABI = [
  "function logHazard(string asset,string riskLevel,uint256 timestamp,uint256 aiConfidenceBps) returns (uint256)",
] as const;

function requireEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function txExplorerBase(chainId: number): string {
  if (chainId === 137) return "https://polygonscan.com/tx/";
  if (chainId === 80002) return "https://amoy.polygonscan.com/tx/";
  return "https://amoy.polygonscan.com/tx/";
}

function parseChainId(): number {
  const raw = String(process.env.POLYGON_CHAIN_ID ?? "80002").trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 80002;
}

type TxRecord = {
  key: string;
  txHash: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  chainId: number;
  explorerUrl: string;
  lastError?: string;
  updatedAt: number;
};

const idempotencyCache = new Map<string, TxRecord>();

async function verifyUserAccessToken(token: string): Promise<void> {
  const issuerBase = requireEnv("AUTH0_ISSUER_BASE_URL").replace(/\/$/, "");
  const issuer = `${issuerBase}/`;
  const audience = requireEnv("AUTH0_IMPRINT_AUDIENCE");
  const imprintPerm = String(process.env.AUTH0_IMPRINT_PERMISSION ?? "imprint:alert").trim();

  const jwks = createRemoteJWKSet(new URL(`${issuerBase}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience,
  });

  const fromPermissions =
    Array.isArray(payload.permissions) &&
    payload.permissions.some((p) => String(p) === imprintPerm);
  const scopes = String(payload.scope ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const fromScope = scopes.includes(imprintPerm);
  if (!fromPermissions && !fromScope) {
    throw new Error(`Token missing permission or scope: ${imprintPerm}`);
  }
}

function bearerMatches(req: express.Request, expected: string): boolean {
  const raw = String(req.headers.authorization ?? "");
  const m = /^Bearer\s+(\S+)$/i.exec(raw);
  return Boolean(m && m[1] === expected);
}

const app = express();
app.use(express.json({ limit: "512kb" }));

app.post("/v1/sign/imprint", async (req, res) => {
  try {
    const apiKey = requireEnv("IMPRINT_SIGNER_API_KEY");
    if (!bearerMatches(req, apiKey)) {
      return res.status(401).json({
        error: "unauthorized",
        detail: "Invalid or missing Authorization: Bearer API key",
      });
    }

    const body = req.body as Record<string, unknown>;
    const userAt = String(body.auth0_access_token ?? "").trim();
    if (!userAt) {
      return res.status(400).json({
        error: "bad_request",
        detail: "auth0_access_token is required",
      });
    }

    await verifyUserAccessToken(userAt);

    const asset = String(body.asset ?? "").trim();
    const riskLevel = String(body.riskLevel ?? "").trim();
    const ts = Number(body.timestamp);
    const aiBps = Number(body.aiConfidenceBps);
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();

    if (
      !asset ||
      !riskLevel ||
      !Number.isFinite(ts) ||
      !Number.isFinite(aiBps) ||
      !idempotencyKey
    ) {
      return res.status(400).json({
        error: "bad_request",
        detail:
          "asset, riskLevel, timestamp, aiConfidenceBps, and idempotencyKey are required",
      });
    }

    const cached = idempotencyCache.get(idempotencyKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const rpc = requireEnv("POLYGON_RPC_URL");
    const pk = requireEnv("POLYGON_PRIVATE_KEY");
    const registry = requireEnv("HAZARD_REGISTRY_ADDRESS");
    const chainId = parseChainId();

    const provider = new JsonRpcProvider(rpc);
    const wallet = new Wallet(pk, provider);
    const contract = new Contract(registry, HAZARD_ABI, wallet);

    const tx = await contract.logHazard(
      asset,
      riskLevel,
      BigInt(Math.floor(ts)),
      BigInt(Math.floor(aiBps)),
    );
    const txHash = String(tx.hash);
    const explorerBase = txExplorerBase(chainId);
    const initial: TxRecord = {
      key: idempotencyKey,
      txHash,
      status: "submitted",
      chainId,
      explorerUrl: `${explorerBase}${txHash}`,
      updatedAt: Date.now(),
    };

    const receipt = await tx.wait();
    const out: TxRecord = {
      ...initial,
      status: receipt?.status === 1 ? "confirmed" : "failed",
      updatedAt: Date.now(),
    };

    idempotencyCache.set(idempotencyKey, out);
    return res.status(200).json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg.startsWith("Missing required env:")) {
      return res.status(500).json({ error: "server_misconfigured", detail: msg });
    }
    if (
      msg.includes("permission") ||
      msg.includes("scope:") ||
      msg.includes("signature") ||
      msg.includes("expired") ||
      msg.includes("jwt") ||
      msg.includes("JWS")
    ) {
      return res.status(403).json({ error: "forbidden", detail: msg });
    }
    console.error(e);
    return res.status(500).json({ error: "internal_error", detail: msg });
  }
});

const port = Number(process.env.PORT ?? 8790);
app.listen(port, () => {
  console.log(`imprint-signer listening on http://127.0.0.1:${port}`);
});
