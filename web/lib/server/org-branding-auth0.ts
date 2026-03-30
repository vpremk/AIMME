import type { OrgBranding } from "@/lib/server/org-branding-store";
import { auth0MgmtEnabled } from "@/lib/server/auth0-management";
import { fetchAuth0Organization } from "@/lib/server/auth0-org-management";

function isHexColor(x: unknown): x is string {
  return typeof x === "string" && /^#[0-9a-fA-F]{6}$/.test(x.trim());
}

function isHttpsUrl(x: unknown): x is string {
  if (typeof x !== "string") return false;
  try {
    const u = new URL(x);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function clampString(x: unknown, max = 80): string | null {
  if (typeof x !== "string") return null;
  const s = x.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Option A: derive branding from Auth0 Organization metadata (via Management API).
 * Metadata keys supported (any of these):
 * - displayName, display_name
 * - logoUrl, logo_url
 * - primaryColor, brand_primary
 * - accentColor, brand_accent
 * - badgeText, header_badge_text
 */
export async function getOrgBrandingFromAuth0(orgId: string): Promise<OrgBranding | null> {
  if (!auth0MgmtEnabled()) return null;

  const org = await fetchAuth0Organization(orgId);
  const m = (org.metadata || {}) as Record<string, unknown>;

  const displayName =
    clampString(m.displayName ?? m.display_name ?? org.display_name ?? org.name, 80) ?? null;

  const logoRaw = m.logoUrl ?? m.logo_url;
  const logoUrl = isHttpsUrl(logoRaw) ? String(logoRaw) : null;

  const primaryRaw = m.primaryColor ?? m.brand_primary;
  const accentRaw = m.accentColor ?? m.brand_accent;
  const primaryColor = isHexColor(primaryRaw) ? String(primaryRaw).toUpperCase() : null;
  const accentColor = isHexColor(accentRaw) ? String(accentRaw).toUpperCase() : null;

  const badgeText = clampString(m.badgeText ?? m.header_badge_text, 32);

  return {
    orgId,
    displayName,
    logoUrl,
    primaryColor,
    accentColor,
    badgeText,
  };
}

