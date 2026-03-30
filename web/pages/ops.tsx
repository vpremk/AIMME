"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { useAuth } from "@/context/AuthProvider";
import { can } from "@/lib/permissions";
import { maskEmail, maskDisplayName } from "@/lib/mask";
import {
  fetchAdminUsers,
  fetchAlerts,
  fetchMassiveTelemetry,
  fetchSignals,
  maskAwsAccountId,
} from "@/utils/api";
import type { MassiveTelemetry, SignalRow, UserMgmtRow } from "@/utils/types";

const REFRESH_MS = 5000;

function fmtTs(ts: number | null): string {
  if (!ts) return "n/a";
  return new Date(ts).toLocaleString();
}

export default function OpsPage() {
  const {
    accountUid,
    me: authMe,
    role,
    loading: authLoading,
    isEnterprise,
    displayEmail,
  } = useAuth();
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [alerts, setAlerts] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null);
  const [userRows, setUserRows] = useState<UserMgmtRow[]>([]);
  const [userRowsError, setUserRowsError] = useState<string | null>(null);
  const [massiveTelemetry, setMassiveTelemetry] = useState<MassiveTelemetry | null>(null);
  const [massiveTelemetryError, setMassiveTelemetryError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!authMe?.authenticated || !accountUid || !role || !can(role, "signals.read")) {
      setLoading(false);
      return;
    }
    const started = Date.now();
    setLastAttemptAt(started);
    try {
      const [s, a] = await Promise.all([fetchSignals(250), fetchAlerts(100)]);
      setSignals(s);
      setAlerts(a);
      if (role === "ops") {
        try {
          const [rows, telemetry] = await Promise.all([
            fetchAdminUsers(200),
            fetchMassiveTelemetry(),
          ]);
          setUserRows(rows);
          setUserRowsError(null);
          setMassiveTelemetry(telemetry);
          setMassiveTelemetryError(null);
        } catch (e) {
          setUserRows([]);
          setMassiveTelemetry(null);
          const msg = maskAwsAccountId(e instanceof Error ? e.message : "Ops admin fetch failed");
          setUserRowsError(msg);
          setMassiveTelemetryError(msg);
        }
      } else {
        setUserRows([]);
        setUserRowsError(null);
        setMassiveTelemetry(null);
        setMassiveTelemetryError(null);
      }
      setLastOkAt(Date.now());
      setError(null);
    } catch (e) {
      setError(maskAwsAccountId(e instanceof Error ? e.message : "Request failed"));
    } finally {
      setLoading(false);
    }
  }, [accountUid, authMe?.authenticated, role]);

  useEffect(() => {
    if (!authMe?.authenticated || !accountUid || !role) {
      setLoading(false);
      return;
    }
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [accountUid, authMe?.authenticated, refresh, role]);

  const stats = useMemo(() => {
    const raw = signals.filter((r) => r.type === "raw");
    const signalRows = signals.filter((r) => r.type === "signal");
    const consentMissing = raw.filter((r) => !r.termsAccepted || !r.userId || !r.userName).length;
    return {
      totalRows: signals.length,
      rawRows: raw.length,
      signalRows: signalRows.length,
      alerts: alerts.length,
      consentMissing,
    };
  }, [alerts.length, signals]);

  const operatorRow = useMemo(
    () =>
      accountUid ? userRows.find((r) => r.userId === accountUid) : undefined,
    [accountUid, userRows],
  );

  const sortedUserRows = useMemo(() => {
    return userRows
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));
  }, [userRows]);

  const healthStatus = error ? "degraded" : lastOkAt ? "healthy" : "unknown";

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {authLoading ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-300">
            Checking authentication...
          </div>
        ) : !authMe?.authenticated ? (
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-4 py-6 text-sm text-cyan-200">
            Sign in first to access Ops.
          </div>
        ) : !isEnterprise ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-6 text-sm text-amber-200">
            The Operations Console (multi-tenant admin, UserManagement telemetry, and market
            telemetry) is available to <strong>Auth0 enterprise</strong> workspaces only. Free-trial
            sandbox users can explore signals on the main dashboard.
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href="/welcome" className="text-amber-100 underline underline-offset-4">
                Enterprise sign-in
              </Link>
              <Link href="/" className="text-amber-100 underline underline-offset-4">
                Main dashboard
              </Link>
            </div>
          </div>
        ) : role !== "ops" ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-4 py-6 text-sm text-rose-200">
            Ops page is restricted to ops role.
            <div className="mt-3">
              <Link href="/" className="text-rose-100 underline underline-offset-4">
                Back to dashboard
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-white">Operations Console</h1>
              <p className="mt-2 text-sm text-slate-500">
                Refreshing every {REFRESH_MS / 1000}s
              </p>
            </div>

            <div className="mb-6 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
              <h2 className="text-sm font-semibold text-slate-300">Signed-in operator</h2>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-slate-500">Email (masked)</dt>
                  <dd className="text-slate-200">
                    {maskEmail(displayEmail)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Role</dt>
                  <dd className="font-medium uppercase text-cyan-200">{role}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Logins recorded</dt>
                  <dd className="tabular-nums text-slate-200">
                    {operatorRow?.loginCount ?? 0}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-slate-500">
                Login count increases on each successful enterprise sign-in (stored in UserManagement). If
                you have not signed in since this was enabled, the count may be 0 until the next login.
              </p>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <h2 className="text-sm font-semibold text-slate-300">System Health</h2>
                <p
                  className={`mt-2 text-sm ${
                    healthStatus === "healthy"
                      ? "text-emerald-300"
                      : healthStatus === "degraded"
                        ? "text-amber-300"
                        : "text-slate-400"
                  }`}
                >
                  {healthStatus.toUpperCase()}
                </p>
                <p className="mt-2 text-xs text-slate-500">Last successful: {fmtTs(lastOkAt)}</p>
                <p className="text-xs text-slate-500">Last attempted: {fmtTs(lastAttemptAt)}</p>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <h2 className="text-sm font-semibold text-slate-300">Pipeline Stats</h2>
                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                  <li>Total rows: {stats.totalRows}</li>
                  <li>Raw rows: {stats.rawRows}</li>
                  <li>Signal rows: {stats.signalRows}</li>
                  <li>Alerts: {stats.alerts}</li>
                </ul>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <h2 className="text-sm font-semibold text-slate-300">Data Quality</h2>
                <p className="mt-2 text-xs text-slate-400">
                  Missing consent/user metadata (raw): {stats.consentMissing}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Checks include `termsAccepted`, `userId`, and `userName`.
                </p>
              </section>
            </div>

            <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="text-sm font-semibold text-slate-300">Registered users</h2>
              <p className="mt-1 text-xs text-slate-500">
                Names are lightly masked. Roles reflect UserManagement (default trader on first ingest).
              </p>
              {userRowsError && (
                <p className="mt-2 text-xs text-amber-300">{userRowsError}</p>
              )}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-xs text-slate-300">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-500">
                      <th className="py-2 pr-3 font-medium">Display name</th>
                      <th className="py-2 pr-3 font-medium">Role</th>
                      <th className="py-2 font-medium">Logins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUserRows.length === 0 && !userRowsError ? (
                      <tr>
                        <td colSpan={3} className="py-3 text-slate-500">
                          No UserManagement rows yet (users appear after consent + ingest, or after login
                          bump once deployed).
                        </td>
                      </tr>
                    ) : (
                      sortedUserRows.map((row) => (
                        <tr key={row.userId} className="border-b border-slate-800/80">
                          <td className="py-2 pr-3">{maskDisplayName(row.name)}</td>
                          <td className="py-2 pr-3 uppercase">{row.role ?? "—"}</td>
                          <td className="py-2 tabular-nums">{row.loginCount}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="text-sm font-semibold text-slate-300">Massive API telemetry</h2>
              <p className="mt-1 text-xs text-slate-500">
                Runtime counters from `/api/market/candles` in this deployment instance.
              </p>
              {massiveTelemetryError && (
                <p className="mt-2 text-xs text-amber-300">{massiveTelemetryError}</p>
              )}
              <div className="mt-3 grid gap-3 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
                  <p className="text-slate-500">Total requests</p>
                  <p className="mt-1 text-base tabular-nums">{massiveTelemetry?.totalRequests ?? 0}</p>
                </div>
                <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
                  <p className="text-slate-500">Success</p>
                  <p className="mt-1 text-base tabular-nums text-emerald-300">
                    {massiveTelemetry?.successCount ?? 0}
                  </p>
                </div>
                <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
                  <p className="text-slate-500">Upstream errors</p>
                  <p className="mt-1 text-base tabular-nums text-amber-300">
                    {massiveTelemetry?.upstreamErrorCount ?? 0}
                  </p>
                </div>
                <div className="rounded border border-slate-700 bg-slate-950/50 p-3">
                  <p className="text-slate-500">Network errors</p>
                  <p className="mt-1 text-base tabular-nums text-rose-300">
                    {massiveTelemetry?.networkErrorCount ?? 0}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                <p>Last symbol: {massiveTelemetry?.lastSymbol ?? "n/a"}</p>
                <p>Last status: {massiveTelemetry?.lastStatus ?? "n/a"}</p>
                <p>Last latency: {massiveTelemetry?.lastLatencyMs ?? "n/a"} ms</p>
                <p>Last event: {fmtTs(massiveTelemetry?.lastEventAt ?? null)}</p>
              </div>
              {massiveTelemetry?.lastError && (
                <p className="mt-2 text-xs text-amber-300">
                  Last error: {maskAwsAccountId(massiveTelemetry.lastError)}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
                {error}
              </div>
            )}

            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="text-sm font-semibold text-slate-300">Recent Activity</h2>
              {loading ? (
                <p className="mt-2 text-xs text-slate-500">Loading...</p>
              ) : (
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-medium text-slate-400">Latest Raw</h3>
                    <pre className="mt-2 overflow-auto rounded bg-slate-950 p-3 text-[11px] text-slate-300">
                      {JSON.stringify(signals.find((x) => x.type === "raw") ?? {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-slate-400">Latest Alert</h3>
                    <pre className="mt-2 overflow-auto rounded bg-slate-950 p-3 text-[11px] text-slate-300">
                      {JSON.stringify(alerts[0] ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
