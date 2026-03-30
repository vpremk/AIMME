import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

export type OrgBranding = {
  orgId: string;
  /** Friendly org name to show in header/UI. */
  displayName?: string | null;
  /** Public URL to logo image (https://...). */
  logoUrl?: string | null;
  /** Hex colors like #7C3AED */
  primaryColor?: string | null;
  accentColor?: string | null;
  /** Optional short label for header badge */
  badgeText?: string | null;
};

const client = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

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

function normalizeItem(orgId: string, item: Record<string, unknown>): OrgBranding {
  const displayName = clampString(item.displayName ?? item.display_name ?? item.name, 80);
  const logoUrlRaw = item.logoUrl ?? item.logo_url ?? item.logo;
  const logoUrl = isHttpsUrl(logoUrlRaw) ? String(logoUrlRaw) : null;
  const primaryRaw = item.primaryColor ?? item.brand_primary ?? item.primary;
  const accentRaw = item.accentColor ?? item.brand_accent ?? item.accent;
  const primaryColor = isHexColor(primaryRaw) ? String(primaryRaw).toUpperCase() : null;
  const accentColor = isHexColor(accentRaw) ? String(accentRaw).toUpperCase() : null;
  const badgeText = clampString(item.badgeText ?? item.header_badge_text ?? item.badge, 32);

  return {
    orgId,
    displayName,
    logoUrl,
    primaryColor,
    accentColor,
    badgeText,
  };
}

function parseBrandingFallbackJson(): Record<string, unknown> | null {
  const raw = process.env.ORG_BRANDING_FALLBACK_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getOrgBranding(orgId: string): Promise<OrgBranding | null> {
  const tableName = process.env.ORG_BRANDING_TABLE_NAME;

  if (tableName) {
    const res = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: { orgId },
      }),
    );
    if (res.Item && typeof res.Item === "object") {
      return normalizeItem(orgId, res.Item as Record<string, unknown>);
    }
  }

  const fallback = parseBrandingFallbackJson();
  if (fallback && typeof fallback[orgId] === "object" && fallback[orgId] != null) {
    return normalizeItem(orgId, fallback[orgId] as Record<string, unknown>);
  }

  return null;
}

