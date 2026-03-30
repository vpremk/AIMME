import type { NextApiRequest, NextApiResponse } from "next";
import { resolveRequestAuth } from "@/lib/request-auth";
import { getOrgBranding, type OrgBranding } from "@/lib/server/org-branding-store";
import { getOrgBrandingFromAuth0 } from "@/lib/server/org-branding-auth0";

type BrandingResponse =
  | { ok: true; branded: boolean; orgId: string | null; branding: OrgBranding | null }
  | { ok: false; error: string; detail?: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<BrandingResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const auth = await resolveRequestAuth(req, res);
  const orgId = auth?.source === "auth0_enterprise" ? auth.orgId ?? null : null;
  if (!orgId) {
    return res.status(200).json({ ok: true, branded: false, orgId: null, branding: null });
  }

  try {
    const auth0Branding = await getOrgBrandingFromAuth0(orgId);
    const ddbBranding = await getOrgBranding(orgId);
    const branding = auth0Branding || ddbBranding;
    return res.status(200).json({
      ok: true,
      branded: !!branding,
      orgId,
      branding,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load org branding";
    return res.status(200).json({
      ok: false,
      error: "branding_lookup_failed",
      detail: msg,
    });
  }
}

