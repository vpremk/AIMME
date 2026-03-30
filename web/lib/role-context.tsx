"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { can, getPermissions, normalizeRole, type Permission, type UserRole } from "@/lib/authz";

type RoleContextValue = {
  role: UserRole;
  permissions: Permission[];
  can: (permission: Permission) => boolean;
  setRole: (role: UserRole) => void;
};

const RoleContext = createContext<RoleContextValue | null>(null);
const STORAGE_KEY = "aimme.userRole";

export function RoleProvider({
  children,
  role: roleInput,
}: {
  children: ReactNode;
  role?: string;
}) {
  const defaultRole = normalizeRole(roleInput);
  const [role, setRole] = useState<UserRole>(defaultRole);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRole(normalizeRole(stored));
      }
    } catch {
      // Ignore storage access failures.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, role);
    } catch {
      // Ignore storage access failures.
    }
  }, [role]);

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      permissions: getPermissions(role),
      can: (permission) => can(role, permission),
      setRole,
    }),
    [role],
  );
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error("useRole must be used inside RoleProvider");
  }
  return ctx;
}
