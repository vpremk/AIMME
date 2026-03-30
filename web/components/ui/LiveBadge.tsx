"use client";

import { motion, useReducedMotion } from "framer-motion";

export function LiveBadge() {
  const reduce = useReducedMotion();

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-950/50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-400 shadow-sm shadow-emerald-900/40">
      <span className="relative flex h-2 w-2">
        {!reduce && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <motion.span
          className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400"
          animate={
            reduce
              ? {}
              : { scale: [1, 1.35, 1], opacity: [1, 0.85, 1] }
          }
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </span>
      Live
    </span>
  );
}
