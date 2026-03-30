"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { maskAwsAccountId } from "@/utils/api";
import { useAuth } from "@/context/AuthProvider";
import { useBrand } from "@/context/BrandProvider";

export function Header() {
  const { branding } = useBrand();
  const {
    me,
    role,
    loading,
    authError,
    signOut,
    displayEmail,
    isEnterprise,
  } = useAuth();
  const orgLabel =
    me?.authenticated && me.source === "auth0_enterprise" && me.orgId
      ? me.orgId
      : null;

  const orgName =
    me?.authenticated && me.source === "auth0_enterprise"
      ? branding?.displayName || (orgLabel ? `Org ${orgLabel}` : null)
      : null;

  const orgLogo =
    me?.authenticated && me.source === "auth0_enterprise" ? branding?.logoUrl || null : null;

  const showOrgHero =
    me?.authenticated && me.source === "auth0_enterprise" && !!(branding?.displayName || orgLabel);

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 shadow-lg shadow-cyan-500/20"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, var(--aimme-brand-primary, var(--accent-gold, #c9a96e)), #8f784d)",
                boxShadow:
                  "0 10px 25px -10px color-mix(in oklab, var(--accent-gold, #c9a96e) 30%, transparent)",
              }}
            >
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-lg font-bold tracking-tight text-white">AIMME</span>
                <span className="text-xs font-medium text-slate-500">AI Markets</span>
              </div>
              <p className="mt-0.5 max-w-xl text-[11px] font-medium leading-snug tracking-wide text-slate-500 sm:text-xs">
                Real-Time AI Market Microstructure Engine
              </p>
            </div>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2 text-right text-xs text-slate-500">
            {loading ? (
              <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] sm:text-xs">
                checking auth...
              </span>
            ) : me?.authenticated ? (
              <>
                {(orgName || orgLabel) && (
                  <span
                    title={orgLabel ? `Auth0 org: ${orgLabel}` : "Auth0 organization"}
                    className="inline-flex max-w-[220px] items-center gap-1.5 truncate rounded-md border border-violet-600/40 bg-violet-950/40 px-2 py-1 text-[10px] text-violet-100 sm:text-xs"
                    style={{
                      borderColor:
                        "color-mix(in oklab, var(--aimme-brand-accent, #7C3AED) 55%, transparent)",
                      backgroundColor:
                        "color-mix(in oklab, var(--aimme-brand-accent, #7C3AED) 18%, rgb(2 6 23))",
                      color: "color-mix(in oklab, var(--aimme-brand-accent, #7C3AED) 85%, white)",
                    }}
                  >
                    {orgLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        src={orgLogo}
                        className="h-4 w-4 rounded-sm bg-slate-900 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <span className="truncate">
                      {branding?.badgeText || orgName || (orgLabel ? `Org: ${orgLabel}` : "Org")}
                    </span>
                  </span>
                )}
                <span className="max-w-[180px] truncate rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 sm:text-xs">
                  {displayEmail || "signed in"}
                </span>
                <span
                  className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide sm:text-xs ${
                    role === "trader"
                      ? "border-cyan-600/50 bg-cyan-900/30 text-cyan-300"
                      : role === "ops"
                        ? "border-emerald-600/50 bg-emerald-900/30 text-emerald-300"
                        : "border-violet-600/50 bg-violet-900/30 text-violet-300"
                  }`}
                >
                  {role || "no-role"}
                </span>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800 sm:text-xs"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/welcome"
                  className="rounded-md bg-violet-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-violet-500 sm:text-xs"
                >
                  Login to Enterprise
                </Link>
              </>
            )}
            {authError && !me?.authenticated && (
              <span className="max-w-[260px] truncate rounded-md border border-amber-600/50 bg-amber-900/20 px-2 py-1 text-[10px] text-amber-300 sm:text-xs">
                {authError}
              </span>
            )}
          </div>
        </div>
        {showOrgHero && (
          <div className="flex items-center justify-center pt-1">
            <div className="flex max-w-[min(680px,90vw)] items-center justify-center gap-3 text-center">
              {orgLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  src={orgLogo}
                  className="h-9 w-9 rounded-md bg-slate-900 object-contain"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="min-w-0">
                <div
                  className="truncate text-xl font-semibold tracking-tight sm:text-2xl"
                  style={{
                    color:
                      "color-mix(in oklab, var(--aimme-brand-accent, #7C3AED) 85%, white)",
                  }}
                  title={orgLabel ? `Auth0 org: ${orgLabel}` : undefined}
                >
                  {branding?.displayName || orgName || (orgLabel ? `Org ${orgLabel}` : "Organization")}
                </div>
              </div>
            </div>
          </div>
        )}
        {isEnterprise && (
          <p className="text-[10px] text-violet-300/90">
            Enterprise session — multi-tenant features and Polygon imprints enabled (server-side).
          </p>
        )}
      </div>
    </header>
  );
}
