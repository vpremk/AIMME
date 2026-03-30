"use client";

/**
 * AIMME dashboard — polls GET /signals, shows market event submission and ledger.
 * On Vercel, set `AIMME_API_BASE_URL` to your API Gateway base (server-side proxy).
 * Locally, `NEXT_PUBLIC_API_URL` can point at FastAPI (e.g. http://localhost:8000).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { SignalTable } from "@/components/SignalTable";
import { AlertPanel } from "@/components/AlertPanel";
import { MlSignalsExplainer } from "@/components/MlSignalsExplainer";
import { CandlestickChart } from "@/components/CandlestickChart";
import { fetchAlerts, fetchSignals, maskAwsAccountId, postSignal } from "@/utils/api";
import { useAuth } from "@/context/AuthProvider";
import { can } from "@/lib/permissions";
import type { SignalRow } from "@/utils/types";

const POLL_MS = 3000;

function hydrateSignalPriceVolume(rows: SignalRow[]): SignalRow[] {
  // Map raw rows so signal rows can inherit market fields via sourceTimestamp.
  const rawByAssetTs = new Map<string, SignalRow>();
  for (const row of rows) {
    if (row.type !== "raw") continue;
    rawByAssetTs.set(`${row.asset}:${row.timestamp}`, row);
  }

  return rows.map((row) => {
    if (row.type !== "signal") return row;
    if (row.price != null || row.volume != null) return row;
    if (!row.sourceTimestamp) return row;
    const source = rawByAssetTs.get(`${row.asset}:${row.sourceTimestamp}`);
    if (!source) return row;
    return {
      ...row,
      price: source.price,
      volume: source.volume,
    };
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const {
    accountUid,
    role,
    authHydrated,
    me,
    isEnterprise,
    displayEmail,
  } = useAuth();
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [alerts, setAlerts] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);

  const [asset, setAsset] = useState("AAPL");
  const [timestamp, setTimestamp] = useState("");
  const [price, setPrice] = useState("190.25");
  const [volume, setVolume] = useState("1500");
  const [submitting, setSubmitting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [agentMode, setAgentMode] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const agentLock = useRef(false);

  const isPublicGuest = authHydrated && !me.authenticated;

  const refresh = useCallback(async () => {
    const authedReads = me?.authenticated === true && !!role && can(role, "signals.read");
    if (!isPublicGuest && !authedReads) {
      setLoading(false);
      setAlertsLoading(false);
      return;
    }
    try {
      const [s, a] = await Promise.all([fetchSignals(100), fetchAlerts(40)]);
      setSignals(hydrateSignalPriceVolume(s));
      setAlerts(a);
      setError(null);
      setAlertError(null);
      setConnected(true);
    } catch (e) {
      const msg = maskAwsAccountId(e instanceof Error ? e.message : "Request failed");
      setError(msg);
      setAlertError(msg);
      setConnected(false);
    } finally {
      setLoading(false);
      setAlertsLoading(false);
    }
  }, [isPublicGuest, me?.authenticated, role]);

  useEffect(() => {
    if (role === "ops" && isEnterprise) {
      void router.replace("/ops");
    }
  }, [isEnterprise, role, router]);

  useEffect(() => {
    const authedReads = me?.authenticated === true && !!role && can(role, "signals.read");
    if (!isPublicGuest && !authedReads) {
      setSignals([]);
      setAlerts([]);
      setConnected(null);
      setLoading(false);
      setAlertsLoading(false);
      return;
    }
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [isPublicGuest, me?.authenticated, refresh, role]);

  const showIngestForm =
    isEnterprise && me.authenticated === true && !!role && can(role, "signals.write");

  function orgKey(): "ORG_1" | "ORG_2" {
    const o = me.authenticated ? (me.orgId ?? "").trim() : "";
    if (o === "ORG_2") return "ORG_2";
    return "ORG_1";
  }

  function orgSymbols(key: "ORG_1" | "ORG_2"): string[] {
    return key === "ORG_2" ? ["NVDA", "MSFT"] : ["AAPL", "TSLA"];
  }

  function pickOrgSymbol(): string {
    const syms = orgSymbols(orgKey());
    return syms[Math.floor(Math.random() * syms.length)] ?? syms[0] ?? "AAPL";
  }

  async function sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  async function runAgentVolumeOutlierOnce(): Promise<void> {
    if (agentLock.current) return;
    agentLock.current = true;
    setAgentRunning(true);
    try {
      const sym = pickOrgSymbol();
      const baseTs = Date.now();
      const baseVol = 1_000;
      const spikeVol = 1_000_000;
      const priceBase = 50 + Math.random() * 450;

      // Baseline (establish moving average window)
      for (let i = 0; i < 10; i += 1) {
        await postSignal({
          asset: sym,
          timestamp: baseTs + i,
          price: Number((priceBase + Math.random()).toFixed(2)),
          volume: baseVol,
          userId: "agent",
          userName: "Agent",
          termsAccepted: true,
        });
        await sleep(75);
      }

      // Spike (volume outlier)
      await postSignal({
        asset: sym,
        timestamp: baseTs + 10,
        price: Number((priceBase + 2 + Math.random()).toFixed(2)),
        volume: spikeVol,
        userId: "agent",
        userName: "Agent",
        termsAccepted: true,
      });

      toast.success(`Agent submitted volume outlier scenario for ${sym}`);
      await refresh();
    } catch (err) {
      toast.error(maskAwsAccountId(err instanceof Error ? err.message : "Agent simulation failed"));
    } finally {
      setAgentRunning(false);
      agentLock.current = false;
    }
  }

  async function onIngest(e: React.FormEvent) {
    e.preventDefault();
    if (agentMode) return;
    setSubmitting(true);
    try {
      const res = await postSignal({
        asset: asset.trim().toUpperCase(),
        timestamp: timestamp.trim() ? Number(timestamp.trim()) : undefined,
        price: price.trim() ? Number(price.trim()) : undefined,
        volume: volume.trim() ? Number(volume.trim()) : undefined,
        userId: accountUid || "",
        userName: displayEmail || "",
        termsAccepted: true,
      });
      toast.success(
        res.requestId
          ? `Submitted (requestId: ${res.requestId})`
          : "Submitted — check table after processing",
      );
      await refresh();
    } catch (err) {
      toast.error(maskAwsAccountId(err instanceof Error ? err.message : "Ingest failed"));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!agentMode) return;
    // Run immediately, then keep running periodically.
    void runAgentVolumeOutlierOnce();
    const id = setInterval(() => {
      void runAgentVolumeOutlierOnce();
    }, 20_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentMode]);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {isPublicGuest && (
          <div className="mb-6 rounded-lg border border-cyan-500/35 bg-cyan-950/20 px-4 py-3 text-xs text-cyan-100">
            <strong className="font-semibold">Free trial — analyst view</strong> — no sign-in
            required. Signals and alerts are read-only. Manual ingest (Submit Market Event) and Polygon
            imprints require{" "}
            <Link href="/welcome" className="underline hover:text-cyan-50">
              enterprise sign-in
            </Link>
            .
          </div>
        )}
        {/* Enterprise workspace banner removed (per UI request). */}
        {!authHydrated ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-300">
            Checking session…
          </div>
        ) : role === "ops" && isEnterprise ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-300">
            Redirecting to Ops Console...
          </div>
        ) : !isPublicGuest && me.authenticated && (!role || !can(role, "signals.read")) ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-4 py-6 text-sm text-rose-200">
            Unauthorized for dashboard access.
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Compliance Dashboard
                {isPublicGuest && (
                  <span className="ml-2 text-lg font-semibold text-violet-300">
                    — analyst (read-only)
                  </span>
                )}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                <span
                  className={`inline-flex rounded px-2 py-0.5 text-xs ${
                    connected === true
                      ? "bg-emerald-900/40 text-emerald-300"
                      : connected === false
                        ? "bg-rose-900/40 text-rose-300"
                        : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {connected === true
                    ? "AWS connected"
                    : connected === false
                      ? "AWS disconnected"
                      : "checking..."}
                </span>
              </p>
            </div>

            <div className="mb-8 grid gap-6 lg:grid-cols-2">
              <div className="order-1">
                <div className="mb-2 sm:mb-3">
                  <h2
                    className={`text-sm font-medium ${
                      isEnterprise ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    Market Data Feed (OHLC)
                    {!isEnterprise && (
                      <span className="ml-2 font-normal text-[11px] text-slate-600">
                        — enterprise only
                      </span>
                    )}
                  </h2>
                  {!isEnterprise && (
                    <p className="mt-1 text-[11px] text-slate-600">
                      Sign in with{" "}
                      <Link
                        href="/welcome"
                        className="text-slate-500 underline hover:text-slate-400"
                      >
                        enterprise (Auth0)
                      </Link>{" "}
                      to load live OHLC (Apply / range controls stay disabled until then).
                    </p>
                  )}
                </div>
                <CandlestickChart initialSymbol={asset} enterpriseLocked={!isEnterprise} />
              </div>
              <div className="order-2 lg:hidden">
                <AlertPanel
                  items={alerts}
                  loading={alertsLoading}
                  error={alertError}
                  enableImprint={isEnterprise && me.authenticated && !!role && can(role, "signals.read")}
                />
              </div>
              <div className="order-3">
                {showIngestForm ? (
                <form
                  onSubmit={onIngest}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg"
                >
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <h2 className="text-lg font-semibold text-white">Submit Market Event</h2>
                    <label className="flex select-none items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={agentMode}
                        onChange={(e) => setAgentMode(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500"
                      />
                      <span className="font-medium text-cyan-200">Agent Mode</span>
                    </label>
                  </div>
                  <p className="mb-4 text-xs text-slate-500">
                    Submit Market Event → DynamoDB raw row → stream → processing → signals.
                  </p>
                  {agentMode ? (
                    <div className="rounded-lg border border-cyan-500/25 bg-cyan-950/20 p-3 text-xs text-cyan-100">
                      <p className="font-medium">Agent Mode is running.</p>
                      <p className="mt-1 text-cyan-200/90">
                        Simulating a volume outlier for <code className="rounded bg-slate-900/70 px-1">{orgKey()}</code>{" "}
                        symbols ({orgSymbols(orgKey()).join(", ")}). Manual submission is disabled.
                      </p>
                      <p className="mt-2 text-[11px] text-slate-400">
                        Originator will show <span className="font-semibold text-emerald-200">Agent</span>.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm">
                          <span className="text-slate-400">Asset</span>
                          <input
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100"
                            value={asset}
                            onChange={(e) => setAsset(e.target.value)}
                            required
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="text-slate-400">Timestamp (ms, optional)</span>
                          <input
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100"
                            value={timestamp}
                            onChange={(e) => setTimestamp(e.target.value)}
                            placeholder="auto"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="text-slate-400">Price</span>
                          <input
                            type="number"
                            step="any"
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="text-slate-400">Volume</span>
                          <input
                            type="number"
                            step="1"
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100"
                            value={volume}
                            onChange={(e) => setVolume(e.target.value)}
                          />
                        </label>
                      </div>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="mt-4 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                      >
                        {submitting ? "Submitting…" : "Submit Market Event"}
                      </button>
                    </>
                  )}
                </form>
              ) : (
                <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg">
                  <h2 className="mb-2 text-lg font-semibold text-white">Submit Market Event</h2>
                  <p className="text-sm text-slate-400">
                    {isPublicGuest ? (
                      <>
                        Manual ingest is{" "}
                        <span className="font-semibold text-slate-200">enterprise-only</span>{" "}
                        (trader role).{" "}
                        <Link
                          href="/welcome"
                          className="text-violet-300 underline hover:text-violet-200"
                        >
                          Sign in with Auth0
                        </Link>{" "}
                        to post events.
                      </>
                    ) : !isEnterprise ? (
                      <>
                        Manual ingest requires an{" "}
                        <Link
                          href="/welcome"
                          className="text-violet-300 underline hover:text-violet-200"
                        >
                          enterprise (Auth0)
                        </Link>{" "}
                        workspace with trader role.
                      </>
                    ) : (
                      <>
                        Current role:{" "}
                        <span className="font-semibold uppercase text-violet-300">{role}</span>.
                        Manual ingest is available to <span className="font-semibold">trader</span>{" "}
                        only.
                      </>
                    )}
                  </p>
                </section>
              )}
              </div>
              <div className="order-4 lg:order-none lg:hidden">
                <h2 id="all-rows" className="mb-3 scroll-mt-24 text-lg font-semibold text-white">
                  All rows (scan)
                </h2>
                <SignalTable items={signals} loading={loading} />
              </div>
            </div>

            {error && (
              <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
                {error} — on Vercel set{" "}
                <code className="rounded bg-slate-800 px-1">AIMME_API_BASE_URL</code> to your API
                Execution Gateway base (local dev uses{" "}
                <code className="rounded bg-slate-800 px-1">NEXT_PUBLIC_API_URL</code>).
              </div>
            )}

            <div className="hidden gap-8 lg:grid lg:grid-cols-3">
              <div className="lg:col-span-2">
                <h2 id="all-rows" className="mb-3 scroll-mt-24 text-lg font-semibold text-white">
                  All rows (scan)
                </h2>
                <SignalTable items={signals} loading={loading} />
              </div>
              <div>
                <AlertPanel
                  items={alerts}
                  loading={alertsLoading}
                  error={alertError}
                  enableImprint={isEnterprise && me.authenticated && !!role && can(role, "signals.read")}
                />
              </div>
            </div>
            <MlSignalsExplainer />
          </>
        )}
      </main>
    </div>
  );
}

