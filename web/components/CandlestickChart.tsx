"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle } from "@/utils/types";
import { fetchCandles, maskAwsAccountId } from "@/utils/api";

type Timespan = "minute" | "hour" | "day";
type RangePreset = "1D" | "5D" | "1M";

const POLL_MS = 20000;

function rangeToWindow(preset: RangePreset): { multiplier: number; timespan: Timespan; ms: number } {
  if (preset === "1D") return { multiplier: 5, timespan: "minute", ms: 24 * 60 * 60 * 1000 };
  if (preset === "5D") return { multiplier: 15, timespan: "minute", ms: 5 * 24 * 60 * 60 * 1000 };
  return { multiplier: 1, timespan: "hour", ms: 30 * 24 * 60 * 60 * 1000 };
}

export function CandlestickChart({
  initialSymbol = "AAPL",
  enterpriseLocked = false,
}: {
  initialSymbol?: string;
  /** When true, chart is disabled (no API calls) and shows enterprise upsell — e.g. free-trial sandbox. */
  enterpriseLocked?: boolean;
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  const [symbol, setSymbol] = useState(initialSymbol.toUpperCase());
  const [symbolInput, setSymbolInput] = useState(initialSymbol.toUpperCase());
  const [range, setRange] = useState<RangePreset>("1D");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);

  const config = useMemo(() => rangeToWindow(range), [range]);

  useEffect(() => {
    const normalized = initialSymbol.trim().toUpperCase();
    if (!normalized) return;
    setSymbolInput(normalized);
    setSymbol(normalized);
  }, [initialSymbol]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (enterpriseLocked) {
        setCandles([]);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const to = new Date();
      const from = new Date(to.getTime() - config.ms);
      try {
        const rows = await fetchCandles({
          symbol,
          multiplier: config.multiplier,
          timespan: config.timespan,
          fromIso: from.toISOString(),
          toIso: to.toISOString(),
          limit: 1000,
        });
        if (cancelled) return;
        setCandles(rows);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(maskAwsAccountId(e instanceof Error ? e.message : "Candles fetch failed"));
        setCandles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [config.ms, config.multiplier, config.timespan, enterpriseLocked, symbol]);

  useEffect(() => {
    if (enterpriseLocked) {
      if (chartApiRef.current) {
        chartApiRef.current.remove();
        chartApiRef.current = null;
        seriesRef.current = null;
      }
      return;
    }

    let cleanupResize: (() => void) | null = null;
    let disposed = false;
    async function mountChart() {
      if (!chartRef.current) return;
      const { CandlestickSeries, createChart } = await import("lightweight-charts");
      if (disposed || !chartRef.current) return;

      const chart = createChart(chartRef.current, {
        width: chartRef.current.clientWidth,
        height: 280,
        layout: {
          background: { color: "#0f172a" },
          textColor: "#94a3b8",
        },
        grid: {
          vertLines: { color: "#1e293b" },
          horzLines: { color: "#1e293b" },
        },
        rightPriceScale: { borderColor: "#334155" },
        timeScale: { borderColor: "#334155", timeVisible: true },
      });
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });
      chartApiRef.current = chart;
      seriesRef.current = series;

      const onResize = () => {
        if (!chartRef.current || !chartApiRef.current) return;
        chartApiRef.current.applyOptions({ width: chartRef.current.clientWidth, height: 280 });
      };
      window.addEventListener("resize", onResize);
      cleanupResize = () => window.removeEventListener("resize", onResize);
    }

    void mountChart();
    return () => {
      disposed = true;
      if (cleanupResize) cleanupResize();
      if (chartApiRef.current) chartApiRef.current.remove();
      chartApiRef.current = null;
      seriesRef.current = null;
    };
  }, [enterpriseLocked]);

  useEffect(() => {
    if (enterpriseLocked || !seriesRef.current) return;
    seriesRef.current.setData(
      candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
  }, [candles, enterpriseLocked]);

  return (
    <div
      className={`rounded-xl border bg-slate-900/60 p-3 ${
        enterpriseLocked
          ? "pointer-events-none border-slate-700/80 opacity-55 grayscale"
          : "border-slate-800"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
          disabled={enterpriseLocked}
          aria-disabled={enterpriseLocked}
          className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 disabled:cursor-not-allowed"
          placeholder="AAPL"
        />
        <button
          type="button"
          disabled={enterpriseLocked}
          aria-disabled={enterpriseLocked}
          onClick={() => setSymbol(symbolInput.trim().toUpperCase() || "AAPL")}
          className="rounded bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply
        </button>
        {(["1D", "5D", "1M"] as RangePreset[]).map((r) => (
          <button
            key={r}
            type="button"
            disabled={enterpriseLocked}
            aria-disabled={enterpriseLocked}
            onClick={() => setRange(r)}
            className={`rounded px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
              range === r ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {r}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-500">
          {enterpriseLocked
            ? "Enterprise feature"
            : `Massive OHLC · ${config.multiplier}/${config.timespan} · ${POLL_MS / 1000}s refresh`}
        </span>
      </div>

      {enterpriseLocked ? (
        <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700/90 bg-slate-950/40 px-4 text-center">
          <p className="text-sm font-medium text-slate-500">Massive candlesticks — enterprise</p>
          <p className="max-w-sm text-xs leading-relaxed text-slate-600">
            Live OHLC is available after Auth0 enterprise sign-in. Symbol, Apply, and 1D/5D/1M stay
            disabled until then.
          </p>
        </div>
      ) : (
        <div ref={chartRef} className="h-[280px] w-full" />
      )}
      {!enterpriseLocked && loading && (
        <p className="mt-2 text-xs text-slate-500">Loading candles...</p>
      )}
      {!enterpriseLocked && !loading && candles.length === 0 && !error && (
        <p className="mt-2 text-xs text-slate-500">No candle data returned for this range.</p>
      )}
      {!enterpriseLocked && error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
    </div>
  );
}
