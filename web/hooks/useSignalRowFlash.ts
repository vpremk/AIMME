"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import type { SignalItem } from "@/lib/types";

export type RowFlash = "buy" | "sell";

/**
 * When an existing row's signal flips to BUY or SELL, flags a short flash for that row id.
 */
export function useSignalRowFlash(items: SignalItem[]): Record<number, RowFlash> {
  const prevSig = useRef<Map<number, string>>(new Map());
  const [flash, setFlash] = useState<Record<number, RowFlash>>({});

  useEffect(() => {
    const newFlash: Record<number, RowFlash> = {};
    const next = new Map<number, string>();

    for (const row of items) {
      next.set(row.id, row.signal);
      const prev = prevSig.current.get(row.id);
      if (prev !== undefined && prev !== row.signal) {
        if (row.signal === "BUY") newFlash[row.id] = "buy";
        else if (row.signal === "SELL") newFlash[row.id] = "sell";
      }
    }
    prevSig.current = next;

    if (Object.keys(newFlash).length === 0) return;

    startTransition(() => {
      setFlash((f) => ({ ...f, ...newFlash }));
    });
    const t = window.setTimeout(() => {
      startTransition(() => {
        setFlash((f) => {
          const copy = { ...f };
          for (const k of Object.keys(newFlash)) {
            delete copy[Number(k)];
          }
          return copy;
        });
      });
    }, 620);
    return () => window.clearTimeout(t);
  }, [items]);

  return flash;
}
