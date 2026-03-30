"use client";

import { useEffect, useState } from "react";

export function AnalyzingDots() {
  const [n, setN] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setN((x) => (x + 1) % 4), 380);
    return () => window.clearInterval(id);
  }, []);

  const dots = ".".repeat(n);

  return (
    <span className="inline-flex min-w-[200px] items-baseline font-medium text-slate-400">
      <span>Analyzing market</span>
      <span className="inline-block w-[1.25em] text-left text-cyan-400/90">
        {dots}
      </span>
    </span>
  );
}
