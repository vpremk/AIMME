"use client";

/**
 * Optional sparkline: last N numeric points from prices in signal rows.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SignalRow } from "@/utils/types";

export function MiniPriceChart({ items }: { items: SignalRow[] }) {
  const withPrice = items
    .filter((r) => r.price != null && r.price > 0)
    .slice(-24)
    .map((r, i) => ({
      i,
      price: r.price as number,
      label: r.asset,
    }));

  if (withPrice.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 text-sm text-slate-500">
        Need at least two rows with price in payload to chart.
      </div>
    );
  }

  return (
    <div className="h-48 w-full rounded-xl border border-slate-800 bg-slate-900/60 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={withPrice}>
          <XAxis dataKey="i" hide />
          <YAxis domain={["auto", "auto"]} width={48} />
          <Tooltip
            formatter={(v) => [
              typeof v === "number" ? `$${v.toFixed(2)}` : String(v),
              "price",
            ]}
            labelFormatter={(i) => `tick ${i}`}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#22d3ee"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
