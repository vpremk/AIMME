import type { NextApiRequest, NextApiResponse } from "next";
import type { SignalRow } from "@/utils/types";
import { getUpstreamBase, upstreamConfigErrorMessage } from "@/lib/server/api-proxy";
import { logHazardOnChain } from "@/lib/server/hazard-onchain";
import { can } from "@/lib/permissions";
import { isEnterprise, resolveRequestAuth, scopeOrgIdForSignals } from "@/lib/request-auth";
import { normalizeItem } from "@/utils/normalize-signal";

function isAlertLike(row: SignalRow): boolean {
  if (row.type !== "signal") return false;
  if (row.anomaly) return true;
  if (row.score != null && (row.score >= 0.9 || row.score <= 0.1)) return true;
  return ["BUY", "SELL", "ANOMALY", "VOLUME_OUTLIER"].includes(
    String(row.signal ?? "").toUpperCase(),
  );
}

function riskLevel(row: SignalRow): "LOW" | "MEDIUM" | "HIGH" {
  if (row.anomaly) return "HIGH";
  const score = row.score ?? 0.5;
  if (score >= 0.9 || score <= 0.1) return "HIGH";
  if (score >= 0.75 || score <= 0.25) return "MEDIUM";
  return "LOW";
}

function fireAndForgetOnChain(alerts: SignalRow[], allowOnChain: boolean): void {
  if (!allowOnChain) return;
  const hazards = alerts.filter((a) => riskLevel(a) === "HIGH");
  for (const a of hazards) {
    void logHazardOnChain({
      asset: a.asset,
      riskLevel: riskLevel(a),
      timestamp: a.timestamp || Date.now(),
      aiConfidence: a.score,
    }).catch(() => {
      // Non-blocking by design; alert flow should not fail.
    });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await resolveRequestAuth(req, res);
  if (auth && !can(auth.role, "signals.read")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const base = getUpstreamBase();
  if (!base) {
    res.status(503).json({
      error: "upstream_not_configured",
      detail: upstreamConfigErrorMessage(),
    });
    return;
  }

  const limitRaw = req.query.limit;
  const limit = Math.max(
    1,
    Math.min(
      500,
      Number(Array.isArray(limitRaw) ? limitRaw[0] : limitRaw ?? 40) || 40,
    ),
  );

  const orgId = scopeOrgIdForSignals(auth);

  // Try native /alerts route first when present upstream.
  let alertsRes: Response;
  try {
    const aq = new URLSearchParams({
      limit: String(limit),
      orgId,
    });
    alertsRes = await fetch(`${base}/alerts?${aq.toString()}`, {
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "fetch failed";
    return res.status(502).json({ error: "upstream_unreachable", detail });
  }
  if (alertsRes.ok) {
    const text = await alertsRes.text();
    res.status(alertsRes.status);
    try {
      const parsed = JSON.parse(text) as { items?: unknown[] };
      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      const rows = rawItems.map((row) =>
        normalizeItem(row && typeof row === "object" ? (row as Record<string, unknown>) : {}),
      );
      fireAndForgetOnChain(rows, auth ? isEnterprise(auth) : false);
      res.json({ ...parsed, items: rows });
    } catch {
      res.send(text);
    }
    return;
  }

  // Fallback for stacks that don't expose /alerts: derive from /signals.
  let signalsRes: Response;
  try {
    const sq = new URLSearchParams({
      limit: String(Math.max(200, limit * 5)),
      orgId,
    });
    signalsRes = await fetch(`${base}/signals?${sq.toString()}`, { cache: "no-store" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "fetch failed";
    return res.status(502).json({ error: "upstream_unreachable", detail });
  }
  if (!signalsRes.ok) {
    const t = await signalsRes.text();
    res.status(signalsRes.status).send(t);
    return;
  }

  const data = (await signalsRes.json()) as { items?: unknown[] };
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems.map((row) =>
    normalizeItem(row && typeof row === "object" ? (row as Record<string, unknown>) : {}),
  );
  const alerts = items.filter(isAlertLike).slice(0, limit);
  fireAndForgetOnChain(alerts, auth ? isEnterprise(auth) : false);
  res.status(200).json({ items: alerts, count: alerts.length });
}
