"use client";

/**
 * Org/signal scoring context for the dashboard.
 */
export function MlSignalsExplainer() {
  return (
    <section
      id="ml-signals-logic"
      className="mt-10 scroll-mt-24 rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-black/40"
    >
      <div id="ml-alert-logic" className="scroll-mt-24">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">
            Detection Engine & Intelligence Layer
          </h2>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="shrink-0 rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Top
          </button>
        </div>
        <div className="mt-3 space-y-3 text-sm text-slate-400">
          <p>
            In the alert log, the <span className="text-slate-300">left button</span> (☆ / ★) pins an alert in this
            browser via <span className="text-slate-300">localStorage</span>. The{" "}
            <span className="text-slate-300">next ★</span> is only a link that scrolls to this block for detection
            context, volume-outlier rules, and ML roadmap — it does not persist selections.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-slate-300">
                GET /alerts
              </code>{" "}
              returns <span className="text-slate-300">org-scoped</span> alert rows for your tenant.
            </li>
            <li>
              <span className="text-slate-300">Stream-driven rules</span> evaluate raw ingests as they
              move through the pipeline so qualifying events can become alert rows without a separate
              batch step.
            </li>
            <li id="volume-outlier-factor" className="scroll-mt-24">
              Volume outliers use only raw{" "}
              <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-slate-300">
                payload.volume
              </code>{" "}
              compared to the average of the prior{" "}
              <span className="text-slate-300">N</span> raw volumes for the same org and asset.{" "}
              <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-slate-300">
                VOLUME_OUTLIER_PRIOR_N
              </code>{" "}
              defaults to <span className="text-slate-300">10</span>;{" "}
              <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-slate-300">
                VOLUME_OUTLIER_FACTOR
              </code>{" "}
              defaults to <span className="text-slate-300">1.5</span> (flag when current volume exceeds
              that multiple of the prior-window average). When the rule fires,{" "}
              <span className="text-slate-300">SNS</span> can notify subscribers and the dashboard can
              show a <span className="text-slate-300">VOLUME_OUTLIER</span> signal row tied to that
              detection.
            </li>
          </ul>
          <div>
            <p className="text-slate-500">ML roadmap</p>
            <ul className="mt-1 list-disc pl-5 text-slate-400">
              <li>
                <span className="text-slate-300">Feature stores</span> and{" "}
                <span className="text-slate-300">models</span> on top of the same ingest and alert
                contract — org-safe training/online features and richer detectors without breaking the
                dashboard.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
