"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { normalizeRole, type AppRole } from "@/lib/permissions";

type User = null;
export type AuthTier = "auth0_enterprise";

export type MeState =
  | {
      authenticated: true;
      source: AuthTier;
      uid: string;
      role: AppRole;
      orgId: string | null;
      email: string | null;
    }
  | { authenticated: false };

type AuthContextValue = {
  user: User;
  me: MeState;
  idToken: string | null;
  role: AppRole | null;
  authSource: AuthTier | null;
  isEnterprise: boolean;
  isSandbox: boolean;
  accountUid: string | null;
  displayEmail: string | null;
  loading: boolean;
  authHydrated: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  assignRole: (role: AppRole) => Promise<void>;
  applySandboxRole: (role: AppRole) => Promise<void>;
  startEnterpriseLogin: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const devRoleOverride = normalizeRole(process.env.NEXT_PUBLIC_DEV_ROLE_OVERRIDE);

async function clearSession() {
  await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
}

async function fetchMe(): Promise<MeState> {
  const res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
  const data = (await res.json()) as { authenticated?: boolean } & Record<string, unknown>;
  if (data.authenticated === true && data.source === "auth0_enterprise") {
    console.info("[auth] Auth0 role:", data.auth0RoleRaw ?? null, "=> app role:", data.role ?? null);
  }
  if (data.authenticated === true && normalizeRole(data.role)) {
    return {
      authenticated: true,
      source: "auth0_enterprise",
      uid: String(data.uid ?? ""),
      role: normalizeRole(data.role)!,
      orgId: data.orgId != null ? String(data.orgId) : null,
      email: data.email != null ? String(data.email) : null,
    };
  }
  return { authenticated: false };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeState>({ authenticated: false });
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    setMe(await fetchMe());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await fetchMe();
      if (!cancelled) {
        setMe(m);
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (typeof window !== "undefined") {
      window.location.href = "/api/auth/login?returnTo=/dashboard";
    }
  }, []);

  const assignRole = useCallback(async (nextRole: AppRole) => {
    void nextRole;
    throw new Error("Role assignment is Auth0-managed.");
  }, []);

  const applySandboxRole = useCallback(async (nextRole: AppRole) => {
    void nextRole;
    throw new Error("Sandbox roles are no longer supported.");
  }, []);

  const startEnterpriseLogin = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.href = "/api/auth/login?returnTo=/dashboard";
  }, []);

  const signOut = useCallback(async () => {
    if (me?.authenticated && me.source === "auth0_enterprise") {
      if (typeof window !== "undefined") {
        const returnTo = encodeURIComponent(`${window.location.origin}/logout`);
        window.location.assign(`/api/auth/logout?returnTo=${returnTo}`);
        window.setTimeout(() => {
          window.location.assign("/api/auth/logout");
        }, 1500);
      }
      return;
    }
    await clearSession();
    setMe({ authenticated: false });
    if (typeof window !== "undefined") {
      window.location.href = "/logout";
    }
  }, [me]);

  const role: AppRole | null = useMemo(() => {
    if (me?.authenticated) return devRoleOverride ?? me.role;
    return devRoleOverride ?? null;
  }, [me]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: null,
      me,
      idToken: null,
      role,
      authSource: me?.authenticated ? me.source : null,
      isEnterprise: me?.authenticated === true && me.source === "auth0_enterprise",
      isSandbox: false,
      accountUid: me?.authenticated === true ? me.uid : null,
      displayEmail: me?.authenticated === true ? me.email : null,
      loading,
      authHydrated: true,
      authError: null,
      signInWithGoogle,
      assignRole,
      applySandboxRole,
      startEnterpriseLogin,
      signOut,
    }),
    [me, role, loading, signInWithGoogle, assignRole, applySandboxRole, startEnterpriseLogin, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
