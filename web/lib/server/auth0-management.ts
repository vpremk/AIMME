type Auth0MgmtToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

let cached:
  | {
      token: string;
      /** epoch ms */
      expiresAt: number;
    }
  | null = null;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name}_missing`);
  return v;
}

function issuerDomain(): string | null {
  const issuer = process.env.AUTH0_ISSUER_BASE_URL;
  if (!issuer) return null;
  try {
    const u = new URL(issuer);
    return u.host;
  } catch {
    return null;
  }
}

export function auth0MgmtEnabled(): boolean {
  return (
    !!process.env.AUTH0_MGMT_CLIENT_ID &&
    !!process.env.AUTH0_MGMT_CLIENT_SECRET &&
    (!!process.env.AUTH0_MGMT_DOMAIN || !!issuerDomain())
  );
}

export async function getAuth0MgmtToken(): Promise<string> {
  if (!auth0MgmtEnabled()) throw new Error("auth0_mgmt_not_configured");
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const domain = process.env.AUTH0_MGMT_DOMAIN || issuerDomain();
  if (!domain) throw new Error("AUTH0_MGMT_DOMAIN_missing");

  const audience =
    process.env.AUTH0_MGMT_AUDIENCE || `https://${domain}/api/v2/`;

  const resp = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: required("AUTH0_MGMT_CLIENT_ID"),
      client_secret: required("AUTH0_MGMT_CLIENT_SECRET"),
      audience,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`auth0_mgmt_token_failed:${resp.status}:${t.slice(0, 300)}`);
  }

  const j = (await resp.json()) as Auth0MgmtToken;
  if (!j.access_token) throw new Error("auth0_mgmt_token_missing");

  const skewMs = 60_000;
  cached = {
    token: j.access_token,
    expiresAt: Date.now() + Math.max(0, (j.expires_in ?? 3600) * 1000 - skewMs),
  };
  return cached.token;
}

export function auth0MgmtBaseUrl(): string {
  const domain = process.env.AUTH0_MGMT_DOMAIN || issuerDomain();
  if (!domain) throw new Error("AUTH0_MGMT_DOMAIN_missing");
  return `https://${domain}/api/v2`;
}

