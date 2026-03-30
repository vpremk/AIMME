import { auth0MgmtBaseUrl, getAuth0MgmtToken } from "@/lib/server/auth0-management";

export type Auth0Organization = {
  id: string;
  name: string;
  display_name?: string;
  branding?: unknown;
  metadata?: Record<string, unknown>;
};

let orgCache = new Map<
  string,
  {
    expiresAt: number;
    value: Auth0Organization;
  }
>();

export async function fetchAuth0Organization(orgId: string): Promise<Auth0Organization> {
  const cached = orgCache.get(orgId);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const token = await getAuth0MgmtToken();
  const base = auth0MgmtBaseUrl();
  const resp = await fetch(`${base}/organizations/${encodeURIComponent(orgId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`auth0_org_fetch_failed:${resp.status}:${t.slice(0, 300)}`);
  }

  const data = (await resp.json()) as Auth0Organization;
  if (!data?.id) throw new Error("auth0_org_invalid_response");

  const ttlMs = Number(process.env.AUTH0_ORG_CACHE_TTL_MS || 300000);
  orgCache.set(orgId, { value: data, expiresAt: Date.now() + Math.max(10_000, ttlMs) });
  return data;
}

