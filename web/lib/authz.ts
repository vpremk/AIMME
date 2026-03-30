export type UserRole = "trader" | "analyst";

export type Permission =
  | "signals.read"
  | "alerts.read"
  | "signals.ingest"
  | "process.trigger"
  | "alert.trigger"
  | "analytics.deep";

const PERMISSIONS_BY_ROLE: Record<UserRole, ReadonlySet<Permission>> = {
  trader: new Set<Permission>([
    "signals.read",
    "alerts.read",
    "signals.ingest",
    "process.trigger",
    "alert.trigger",
  ]),
  analyst: new Set<Permission>(["signals.read", "alerts.read", "analytics.deep"]),
};

export function normalizeRole(input: string | undefined): UserRole {
  return input?.toLowerCase() === "trader" ? "trader" : "analyst";
}

export function getPermissions(role: UserRole): Permission[] {
  return Array.from(PERMISSIONS_BY_ROLE[role]);
}

export function can(role: UserRole, permission: Permission): boolean {
  return PERMISSIONS_BY_ROLE[role].has(permission);
}
