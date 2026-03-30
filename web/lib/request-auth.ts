import type { NextApiRequest, NextApiResponse } from "next";
import { getSession } from "@auth0/nextjs-auth0";
import { normalizeRole, type AppRole } from "@/lib/permissions";

export type AuthSource = "auth0_enterprise";

export type ResolvedRequestAuth = {
  source: AuthSource;
  uid: string;
  role: AppRole;
  auth0RoleRaw?: string | null;
  orgId?: string | null;
  orgName?: string | null;
  email?: string | null;
};

const ROLE_CLAIM = process.env.AUTH0_ROLE_CLAIM || "https://aimme.app/role";
const ORG_CLAIM = process.env.AUTH0_ORG_CLAIM || "https://aimme.app/org_id";
const ORG_NAME_CLAIM = process.env.AUTH0_ORG_NAME_CLAIM || "https://aimme.app/org_name";

function roleClaimCandidates(): string[] {
  const out = new Set<string>([
    ROLE_CLAIM,
    "role",
    "roles",
    "https://aimme.app/role",
    "https://aimme.app/roles",
  ]);
  if (ROLE_CLAIM.endsWith("/role")) out.add(`${ROLE_CLAIM}s`);
  if (ROLE_CLAIM.endsWith("/roles")) out.add(ROLE_CLAIM.slice(0, -1));
  return Array.from(out);
}

function readAuth0Role(user: Record<string, unknown>): AppRole | null {
  const single = roleClaimCandidates().map((k) => user[k]);
  for (const raw of single) {
    const n = normalizeRole(raw);
    if (n) return n;
  }
  for (const raw of single) {
    if (Array.isArray(raw)) {
      for (const r of raw) {
        const n = normalizeRole(r);
        if (n) return n;
      }
    }
  }
  for (const [k, v] of Object.entries(user)) {
    if (!k.toLowerCase().includes("role")) continue;
    const n = normalizeRole(v);
    if (n) return n;
    if (Array.isArray(v)) {
      for (const r of v) {
        const mapped = normalizeRole(r);
        if (mapped) return mapped;
      }
    }
  }
  return null;
}

function readAuth0RoleRaw(user: Record<string, unknown>): string | null {
  const single = roleClaimCandidates().map((k) => user[k]);
  for (const raw of single) {
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  for (const raw of single) {
    if (!Array.isArray(raw)) continue;
    for (const r of raw) {
      if (typeof r === "string" && r.trim()) return r.trim();
    }
  }
  for (const [k, v] of Object.entries(user)) {
    if (!k.toLowerCase().includes("role")) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v)) {
      for (const r of v) {
        if (typeof r === "string" && r.trim()) return r.trim();
      }
    }
  }
  return null;
}

function readAuth0Org(user: Record<string, unknown>): string | null {
  const orgId = user[ORG_CLAIM] ?? user["org_id"];
  if (orgId == null) return null;
  return String(orgId);
}

function readAuth0OrgName(user: Record<string, unknown>): string | null {
  const orgName = user[ORG_NAME_CLAIM] ?? user["org_name"];
  if (orgName == null) return null;
  const out = String(orgName).trim();
  return out || null;
}

/**
 * Resolve caller auth from Auth0 enterprise session.
 */
export async function resolveRequestAuth(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<ResolvedRequestAuth | null> {
  try {
    const session = await getSession(req, res);
    const u = session?.user as Record<string, unknown> | undefined;
    if (u && typeof u.sub === "string") {
      /** IdP may omit role claim; default to trader so enterprise gets ingest, charts, imprints. */
      const role: AppRole = readAuth0Role(u) ?? "trader";
      return {
        source: "auth0_enterprise",
        uid: String(u.sub),
        role,
        auth0RoleRaw: readAuth0RoleRaw(u),
        orgId: readAuth0Org(u),
        orgName: readAuth0OrgName(u),
        email: u.email != null ? String(u.email) : null,
      };
    }
  } catch {
    /* Auth0 not configured or invalid */
  }
  return null;
}

export async function requireRequestAuth(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<ResolvedRequestAuth> {
  const auth = await resolveRequestAuth(req, res);
  if (!auth) throw new Error("missing_auth");
  return auth;
}

export function isEnterprise(auth: { source: AuthSource }): boolean {
  return auth.source === "auth0_enterprise";
}

/** Shared with upstream GET /signals for org isolation; legacy rows without orgId are visible here. */
export const PUBLIC_SIGNALS_ORG_ID = "__public__";

/** Tenant key for listing signals/alerts (Auth0 org, per-user sandbox, or public legacy bucket). */
export function scopeOrgIdForSignals(
  auth: Pick<ResolvedRequestAuth, "source" | "uid" | "orgId"> | null,
): string {
  if (!auth) return PUBLIC_SIGNALS_ORG_ID;
  const o = auth.orgId?.trim();
  return o ? o : `user:${auth.uid}`;
}
