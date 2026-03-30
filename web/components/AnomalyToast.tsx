"use client";

import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";

type Props = {
  asset: string;
  signal: string;
  confidencePct: number;
  toastId: string | number;
};

function ToastInner({ asset, signal, confidencePct, toastId }: Props) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      layout
      initial={
        reduce
          ? { opacity: 1, x: 0, scale: 1 }
          : { opacity: 0, x: 96, scale: 0.95 }
      }
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{
        type: "spring",
        damping: 26,
        stiffness: 380,
        mass: 0.55,
      }}
      className="pointer-events-auto w-[min(100vw-2rem,22rem)] rounded-xl border border-rose-500/55 bg-slate-950/95 p-4 text-left shadow-[0_0_28px_rgba(244,63,94,0.32)] backdrop-blur-md"
    >
      <div className="relative flex items-start justify-between gap-3">
        <motion.div
          className="min-w-0 flex-1"
          initial={{ x: 0 }}
          animate={
            reduce
              ? false
              : { x: [0, -5, 5, -4, 4, -2, 2, 0] }
          }
          transition={{ delay: 0.25, duration: 0.42, ease: "easeInOut" }}
        >
          <p className="text-sm font-semibold text-rose-100">
            Anomaly · {asset}
          </p>
          <p className="mt-1 text-xs text-rose-200/85">
            {signal} @ {confidencePct.toFixed(0)}% confidence
          </p>
        </motion.div>
        <button
          type="button"
          onClick={() => toast.dismiss(toastId)}
          className="shrink-0 rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}

export function showAnomalyToast(
  asset: string,
  signal: string,
  confidence: number,
) {
  const confidencePct = confidence * 100;
  return toast.custom(
    (id) => (
      <ToastInner
        toastId={id}
        asset={asset}
        signal={signal}
        confidencePct={confidencePct}
      />
    ),
    { duration: 6500 },
  );
}
