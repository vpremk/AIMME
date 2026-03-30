import type { NextApiRequest, NextApiResponse } from "next";
import { resolveRequestAuth } from "@/lib/request-auth";
import { auth0MgmtEnabled } from "@/lib/server/auth0-management";
import { fetchAuth0Organization } from "@/lib/server/auth0-org-management";

type Resp =
  | { ok: true; orgId: string; organization: unknown }
  | { ok: false; error: string; detail?: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!auth0MgmtEnabled()) {
    return res.status(503).json({
      ok: false,
      error: "auth0_mgmt_not_configured",
      detail:
        "Set AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET, and AUTH0_MGMT_DOMAIN (or AUTH0_ISSUER_BASE_URL) in the web server environment.",
    });
  }

  const auth = await resolveRequestAuth(req, res);
  const orgId = auth?.source === "auth0_enterprise" ? auth.orgId ?? null : null;
  if (!orgId) {
    return res.status(401).json({ ok: false, error: "missing_org" });
  }

  try {
    const org = await fetchAuth0Organization(orgId);
    return res.status(200).json({ ok: true, orgId, organization: org });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch organization";
    return res.status(502).json({ ok: false, error: "auth0_org_fetch_failed", detail: msg });
  }
}

