"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type OrgBranding = {
  orgId: string;
  displayName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  badgeText?: string | null;
};

type BrandState = {
  loading: boolean;
  orgId: string | null;
  branding: OrgBranding | null;
  /** Branding resolved (either from table or fallback). */
  branded: boolean;
};

const BrandContext = createContext<BrandState | null>(null);

function applyCssVars(branding: OrgBranding | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const primary = branding?.primaryColor || "";
  const accent = branding?.accentColor || "";
  root.style.setProperty("--aimme-brand-primary", primary);
  root.style.setProperty("--aimme-brand-accent", accent);
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BrandState>({
    loading: true,
    orgId: null,
    branding: null,
    branded: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/org/branding", { credentials: "same-origin" });
        const data = (await res.json()) as
          | { ok: true; branded: boolean; orgId: string | null; branding: OrgBranding | null }
          | { ok: false };
        if (cancelled) return;
        if ("ok" in data && data.ok === true) {
          setState({
            loading: false,
            orgId: data.orgId,
            branding: data.branding,
            branded: data.branded,
          });
          applyCssVars(data.branding);
          return;
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) {
        setState({ loading: false, orgId: null, branding: null, branded: false });
        applyCssVars(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandState {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used inside BrandProvider");
  return ctx;
}

