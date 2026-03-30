/** Light masking for display on ops / shared screens (not a security boundary). */

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  if (at < 1) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return "•••";
  if (local.length <= 2) return `••@${domain}`;
  return `${local[0]}•••${local.slice(-1)}@${domain}`;
}

export function maskDisplayName(name: string | null | undefined): string {
  if (!name) return "—";
  const t = name.trim();
  if (!t) return "—";
  if (t.length <= 2) return "••";
  return `${t[0]}•••${t.slice(-1)}`;
}
