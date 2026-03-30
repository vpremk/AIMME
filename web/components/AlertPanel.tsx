"use client";

/**
 * Alert log — data from GET /alerts (if present) or client-filtered GET /signals.
 */
import type { HazardTx, SignalRow } from "@/utils/types";
import { useCallback, useEffect, useState } from "react";
import { fetchHazardTxStatus, logHazardOnChain, maskAwsAccountId } from "@/utils/api";


function fmtTs(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function fmtExplorerStatus(tx: HazardTx | undefined): string {
  const raw = tx?.explorerStatus ?? tx?.status;
  if (!raw) return "—";
  switch (raw) {
    case "unknown_no_api_key":
      return tx?.explorerHint ?? "Configure POLYGON_RPC_URL or POLYGONSCAN_API_KEY";
    case "unknown_error":
      return tx?.explorerError ? `RPC error: ${tx.explorerError}` : "Status check failed";
    default:
      return raw;
  }
}

function shortAlertId(id: string): string {
  const parts = id.split("-");
  if (parts.length >= 3) return parts.slice(-2).join("-");
  return id.length > 18 ? id.slice(0, 18) + "…" : id;
}

function isVolumeOutlierRow(row: SignalRow): boolean {
  return (
    row.alertSource === "volume_outlier" ||
    String(row.signal ?? "").toUpperCase() === "VOLUME_OUTLIER"
  );
}

export function AlertPanel({
  items,
  loading,
  error,
  enableImprint = false,
}: {
  items: SignalRow[];
  loading: boolean;
  error: string | null;
  /** On-chain imprint — Auth0 enterprise only (server-enforced). */
  enableImprint?: boolean;
}) {
  const [txById, setTxById] = useState<Record<string, HazardTx>>({});
  const [busyById, setBusyById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!enableImprint) return;
    if (!items || items.length === 0) return;
    let cancelled = false;

    const keys = items
      .filter((r) => r.type === "signal")
      .map((row) => {
        const risk = riskLevel(row);
        const ts = row.timestamp || Date.now();
        const key = `${row.asset}:${risk}:${Math.floor(ts)}`;
        return { id: row.id, key };
      });

    (async () => {
      // Light throttling: do sequential status reads to avoid hammering.
      for (const k of keys) {
        if (cancelled) return;
        try {
          const tx = await fetchHazardTxStatus(k.key);
          if (cancelled) return;
          setTxById((s) => ({ ...s, [k.id]: tx }));
        } catch {
          // Ignore missing / unauthorized / not found — means not approved yet.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableImprint, items]);

  function riskLevel(row: SignalRow): "LOW" | "MEDIUM" | "HIGH" {
    if (row.anomaly) return "HIGH";
    const score = row.score ?? 0.5;
    if (score >= 0.9 || score <= 0.1) return "HIGH";
    if (score >= 0.75 || score <= 0.25) return "MEDIUM";
    return "LOW";
  }

  async function onView(row: SignalRow): Promise<void> {
    const risk = riskLevel(row);
    setBusyById((s) => ({ ...s, [row.id]: true }));
    try {
      const tx = await logHazardOnChain({
        asset: row.asset,
        riskLevel: risk,
        timestamp: row.timestamp || Date.now(),
        aiConfidence: row.score,
      });
      const latest = await fetchHazardTxStatus(tx.key).catch(() => tx);
      setTxById((s) => ({ ...s, [row.id]: latest }));
      if (latest.explorerUrl) window.open(latest.explorerUrl, "_blank", "noopener,noreferrer");
    } finally {
      setBusyById((s) => ({ ...s, [row.id]: false }));
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-black/40">
      <div className="mb-4 border-b border-slate-800 pb-3">
        <button
          type="button"
          className="rounded-md border border-emerald-500/35 bg-emerald-950/30 px-3 py-1.5 text-sm font-semibold tracking-tight text-emerald-100"
        >
          Ledger Audit
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-rose-950/50 p-3 text-sm text-rose-300">
          {maskAwsAccountId(error)}
        </p>
      )}

      {loading && items.length === 0 && !error && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-800/80" />
          ))}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">No alerts yet.</p>
      )}

      <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {items.map((row) => {
          return (
            <li
              key={row.id}
              className="rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2.5 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-1 items-center gap-2 font-mono font-semibold text-amber-100">
                  <a
                    href="#all-rows"
                    className="rounded bg-amber-900/40 px-1 py-0.5 text-[11px] font-semibold text-amber-200/90 underline decoration-amber-400/40 underline-offset-2 hover:text-amber-100"
                    title="Jump to All rows (scan)"
                  >
                    {shortAlertId(row.id)}
                  </a>
                  {maskAwsAccountId(row.asset)}
                  {row.userName === "Agent" ? (
                    <span className="ml-1 rounded border border-emerald-500/40 bg-emerald-950/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                      Agent
                    </span>
                  ) : null}
                  {isVolumeOutlierRow(row) && row.signal ? (
                    <span className="ml-1 rounded border border-cyan-500/35 bg-cyan-950/25 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200">
                      {String(row.signal).toUpperCase()}
                    </span>
                  ) : null}
                </span>

                {enableImprint ? (
                  <span className="shrink-0">
                    {(() => {
                      const tx = txById[row.id];
                      const showLedgerLink = Boolean(
                        tx?.explorerUrl && (tx?.txHash || "").length > 0,
                      );
                      return (
                        <>
                          {!showLedgerLink && (
                            <button
                              type="button"
                              onClick={() => void onView(row)}
                              disabled={busyById[row.id] === true}
                              className="rounded border border-cyan-600/60 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {busyById[row.id] ? "Approving..." : "Approve"}
                            </button>
                          )}
                          {showLedgerLink && (
                            <a
                              href={tx!.explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-medium text-emerald-300 underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-200"
                            >
                              Polygon ledger
                            </a>
                          )}
                        </>
                      );
                    })()}
                  </span>
                ) : null}
              </div>
              {isVolumeOutlierRow(row) && (
                <p className="mt-1 text-[11px] leading-snug text-cyan-200/90">
                  <a
                    href="#volume-outlier-factor"
                    className="font-medium text-cyan-300 underline decoration-cyan-500/50 underline-offset-2 hover:text-cyan-200"
                  >
                    Auto-generated volume outlier
                  </a>
                  <span className="text-slate-500">
                    {" "}
                    · raw{" "}
                    <code className="rounded bg-slate-900/80 px-1 font-mono text-slate-400">
                      payload.volume
                    </code>{" "}
                    vs prior {row.priorSampleSize ?? 10} — see{" "}
                    <code className="rounded bg-slate-900/80 px-1 font-mono text-slate-400">
                      VOLUME_OUTLIER_FACTOR
                    </code>
                  </span>
                </p>
              )}
              {!enableImprint ? (
                <div className="mt-2">
                  <span className="text-[10px] text-slate-600">
                    Polygon approvals — enterprise only
                  </span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
