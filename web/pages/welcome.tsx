"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import { useAuth } from "@/context/AuthProvider";

/**
 * Enterprise entry (Auth0). Free trial is anonymous on `/` (analyst read-only).
 */
export default function WelcomePage() {
  const router = useRouter();
  const {
    me,
    loading,
    authHydrated,
    authError,
    startEnterpriseLogin,
  } = useAuth();

  useEffect(() => {
    if (!authHydrated) return;
    if (me.authenticated) {
      void router.replace("/dashboard");
    }
  }, [authHydrated, me, router]);

  if (!authHydrated || loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="mx-auto max-w-4xl px-4 py-24 text-center text-sm text-slate-400">
          Loading…
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex min-h-[calc(100vh-88px)] max-w-4xl flex-col justify-center px-4 py-12 sm:px-6">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Enterprise sign-in
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            The{" "}
            <Link href="/dashboard" className="text-cyan-400 underline hover:text-cyan-300">
              analyst dashboard
            </Link>{" "}
            is open without an account (read-only). Auth0 unlocks ingest, org RBAC, and Polygon
            hazard imprints.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-cyan-500/35 bg-slate-900/80 p-6 shadow-lg shadow-cyan-950/30">
            <h2 className="text-lg font-semibold text-cyan-200">Free trial</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Browse signals, alerts, and market charts as an analyst — no account or email
              required. Manual POST /signals stays off for anonymous traffic.
            </p>
            <ul className="mt-4 space-y-1 text-left text-[11px] text-slate-500">
              <li>Public GET /signals and /alerts via this site</li>
              <li>Ingest and on-chain features via enterprise only</li>
            </ul>
            <Link
              href="/dashboard"
              className="mt-6 flex w-full items-center justify-center rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500"
            >
              Open analyst dashboard
            </Link>
          </section>

          <section className="rounded-2xl border border-violet-500/35 bg-slate-900/80 p-6 shadow-lg shadow-violet-950/30">
            <h2 className="text-lg font-semibold text-violet-200">Enterprise login</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Auth0 Universal Login (SSO). Org and role come from your IdP. Unlocks manual ingest
              (trader), multi-tenant admin, and Polygon logging.
            </p>
            <ul className="mt-4 space-y-1 text-left text-[11px] text-slate-500">
              <li>Organization from Auth0 claims</li>
              <li>RBAC enforced server-side</li>
              <li>On-chain hazard logging enabled</li>
            </ul>
            <button
              type="button"
              onClick={startEnterpriseLogin}
              className="mt-6 w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Enterprise — Auth0
            </button>
          </section>
        </div>

        <p className="mt-10 text-center text-[11px] text-slate-600">
          Already signed in?{" "}
          <Link href="/" className="text-cyan-400 underline hover:text-cyan-300">
            Go to dashboard
          </Link>
        </p>

        {authError && !me?.authenticated && (
          <p className="mx-auto mt-6 max-w-md rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-center text-xs text-red-200">
            {authError}
          </p>
        )}
      </main>
    </div>
  );
}
