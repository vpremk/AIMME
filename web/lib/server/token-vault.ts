export type TokenVaultSignRequest = {
  auth0_access_token: string;
  chainId: number;
  to: string;
  data: string;
  idempotencyKey: string;
};

export type TokenVaultSignResponse = {
  txHash?: string;
  chainId?: number;
  status?: "submitted" | "confirmed" | "failed";
  lastError?: string;
};

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

export function isTokenVaultSigningMode(): boolean {
  return String(process.env.POLYGON_SIGNING_MODE || "").trim().toLowerCase() === "vault";
}

export function assertTokenVaultConfig(): void {
  if (!isTokenVaultSigningMode()) return;
  const base = env("TOKEN_VAULT_URL");
  if (!base) throw new Error("TOKEN_VAULT_URL is required when POLYGON_SIGNING_MODE=vault");
  const audience = env("AUTH0_IMPRINT_AUDIENCE");
  if (!audience) throw new Error("AUTH0_IMPRINT_AUDIENCE is required for vault signing");
}

export async function requestTokenVaultSignature(
  input: TokenVaultSignRequest,
): Promise<Required<Pick<TokenVaultSignResponse, "txHash">> & TokenVaultSignResponse> {
  const base = env("TOKEN_VAULT_URL").replace(/\/+$/, "");
  if (!base) throw new Error("TOKEN_VAULT_URL is not set");
  const path = env("TOKEN_VAULT_SIGN_PATH") || "/v1/sign/imprint";
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const serviceToken = env("TOKEN_VAULT_SERVICE_TOKEN");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (serviceToken) headers.Authorization = `Bearer ${serviceToken}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  const text = await res.text();
  let j: TokenVaultSignResponse = {};
  try {
    j = text ? (JSON.parse(text) as TokenVaultSignResponse) : {};
  } catch {
    throw new Error(`Token vault returned invalid JSON (${res.status})`);
  }

  if (!res.ok) {
    const detail = j.lastError || text.slice(0, 300);
    throw new Error(`Token vault sign failed (${res.status}): ${detail}`);
  }

  const txHash = String(j.txHash || "").trim();
  if (!txHash) throw new Error("Token vault response missing txHash");
  return { ...j, txHash };
}

