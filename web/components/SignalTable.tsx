"use client";

/**
 * Reusable table for DynamoDB-backed signal rows (raw + processed).
 */
import type { SignalRow } from "@/utils/types";
import { useMemo } from "react";
import { maskAwsAccountId } from "@/utils/api";

function fmtTs(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function fmtAge(ts: number, now: number) {
  if (!ts) return "—";
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function shortRowId(id: string): string {
  const parts = id.split("-");
  if (parts.length >= 3) return parts.slice(-2).join("-");
  return id.length > 18 ? id.slice(0, 18) + "…" : id;
}

export function SignalTable({
  items,
  loading,
}: {
  items: SignalRow[];
  loading: boolean;
}) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.timestamp - a.timestamp),
    [items],
  );
  const now = Date.now();

  if (loading && items.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-lg bg-slate-800/80"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-10 text-center text-slate-500">
        <p className="font-medium text-slate-400">No rows yet</p>
        <p className="mt-2 text-sm">
          Submit a market event from the form or wait for the ingestion pipeline.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg shadow-black/40">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3 font-semibold">#</th>
            <th className="px-4 py-3 font-semibold">Asset</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Price</th>
            <th className="px-4 py-3 font-semibold">Volume</th>
            <th className="px-4 py-3 font-semibold">Signal</th>
            <th className="px-4 py-3 font-semibold">Originator</th>
            <th className="px-4 py-3 font-semibold">Age</th>
            <th className="px-4 py-3 font-semibold">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {sorted.map((row, idx) => (
            <tr key={row.id} className="hover:bg-slate-800/30">
              <td className="px-4 py-3 font-mono text-slate-500">{idx + 1}</td>
              <td className="px-4 py-3 font-mono font-semibold text-cyan-400">
                {maskAwsAccountId(row.asset)}
              </td>
              <td className="px-4 py-3 text-slate-400">{row.type}</td>
              <td className="px-4 py-3 font-mono text-slate-300">
                {row.price != null ? `$${row.price.toFixed(2)}` : "—"}
              </td>
              <td className="px-4 py-3 font-mono text-slate-400">
                {row.volume != null ? row.volume.toLocaleString() : "—"}
              </td>
              <td className="px-4 py-3">
                {row.signal ? (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <span className="rounded border border-slate-600 px-2 py-0.5 text-xs font-bold text-slate-200">
                      {row.signal}
                    </span>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="rounded bg-amber-900/30 px-1 py-0.5 font-mono text-[11px] font-semibold text-amber-200/90">
                      {shortRowId(row.id)}
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </td>
              <td
                className="max-w-[140px] truncate px-4 py-3 text-xs text-slate-400"
                title={row.userName || row.userId || ""}
              >
                {row.userName === "Agent"
                  ? "Agent"
                  : row.userName
                    ? maskAwsAccountId(row.userName)
                    : row.userId
                      ? maskAwsAccountId(row.userId.slice(0, 12) + "…")
                      : "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-400">
                {fmtAge(row.timestamp, now)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                {fmtTs(row.timestamp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
