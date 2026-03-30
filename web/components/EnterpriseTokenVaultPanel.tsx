"use client";

import { useCallback, useEffect, useState } from "react";

type VaultState =
  | { loading: true }
  | { loading: false; configured: boolean; detail: string; error?: string };

/**
 * Enterprise-only stub for AI agent credential / Token Vault integration.
 */
export function EnterpriseTokenVaultPanel() {
  const [state, setState] = useState<VaultState>({ loading: true });

  const load = useCallback(async () => {
    setState({ loading: true });
    try {
      const res = await fetch("/api/agent/token-vault", { credentials: "same-origin" });
      const data = (await res.json()) as {
        configured?: boolean;
        detail?: string;
        error?: string;
      };
      if (!res.ok) {
        setState({
          loading: false,
          configured: false,
          detail: data.detail || data.error || `HTTP ${res.status}`,
          error: data.error,
        });
        return;
      }
      setState({
        loading: false,
        configured: Boolean(data.configured),
        detail: String(data.detail || ""),
      });
    } catch (e) {
      setState({
        loading: false,
        configured: false,
        detail: e instanceof Error ? e.message : "Request failed",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-xl border border-violet-500/25 bg-violet-950/15 p-4">
      <h2 className="text-sm font-semibold text-violet-200">Token vault (enterprise)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Bridge for AI agents — server-side secret injection. Configure{" "}
        <code className="rounded bg-slate-900 px-1">TOKEN_VAULT_URL</code> or{" "}
        <code className="rounded bg-slate-900 px-1">AGENT_SECRETS_KMS_KEY</code> in deployment.
      </p>
      {state.loading ? (
        <p className="mt-3 text-xs text-slate-400">Checking vault status…</p>
      ) : (
        <p
          className={`mt-3 text-xs ${
            state.configured ? "text-emerald-300" : "text-amber-200/90"
          }`}
        >
          {state.configured ? "Vault endpoint configured (stub)." : state.detail}
        </p>
      )}
    </section>
  );
}
