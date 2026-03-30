"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion, useReducedMotion } from "framer-motion";
import type { SignalItem } from "@/lib/types";
import { syntheticPriceSeries } from "@/lib/demo";
import { formatChartTime } from "@/lib/format";
import { CardMotion } from "@/components/ui/CardMotion";

type Props = {
  items: SignalItem[];
  asset: string;
};

export function AssetChart({ items, asset }: Props) {
  const reduce = useReducedMotion();
  const sorted = [...items].sort((a, b) => a.timestamp - b.timestamp);
  const ts = sorted.map((x) => x.timestamp);
  const conf = sorted.map((x) => x.confidence);

  const confidenceData = sorted.map((row) => ({
    label: formatChartTime(row.timestamp),
    t: row.timestamp,
    confidencePct: Math.round(row.confidence * 1000) / 10,
    signal: row.signal,
  }));

  const priceData = syntheticPriceSeries(asset, ts, conf).map((pt, i) => ({
    label: formatChartTime(pt.t),
    t: pt.t,
    price: pt.p,
    signal: sorted[i]?.signal ?? "HOLD",
  }));

  const chartDuration = reduce ? 0 : 1100;

  if (sorted.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-slate-500"
      >
        No history for this asset.
      </motion.div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CardMotion className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
        <h3 className="mb-1 text-sm font-medium text-slate-400">
          Signal confidence
        </h3>
        <p className="mb-4 text-xs text-slate-600">Model output over time</p>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={confidenceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                label={{
                  value: "%",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#64748b",
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Line
                type="monotone"
                dataKey="confidencePct"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ r: 3, fill: "#06b6d4" }}
                name="Confidence %"
                isAnimationActive={!reduce}
                animationDuration={chartDuration}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardMotion>

      <CardMotion className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
        <h3 className="mb-1 text-sm font-medium text-slate-400">
          Price trend (synthetic)
        </h3>
        <p className="mb-4 text-xs text-slate-600">
          Demo series derived from confidence (market feed not on API)
        </p>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={priceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                }}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
                name="Price"
                isAnimationActive={!reduce}
                animationDuration={chartDuration}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardMotion>
    </div>
  );
}
