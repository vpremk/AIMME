export type AppRole = "trader" | "analyst" | "ops";
export type Action =
  | "signals.read"
  | "signals.write"
  | "process.write"
  | "alert.write"
  | "admin.users.read";

const MAP: Record<AppRole, ReadonlySet<Action>> = {
  trader: new Set<Action>(["signals.read", "signals.write", "process.write", "alert.write"]),
  analyst: new Set<Action>(["signals.read"]),
  ops: new Set<Action>(["signals.read", "process.write", "alert.write", "admin.users.read"]),
};

export function normalizeRole(value: unknown): AppRole | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "trader") return "trader";
    if (v === "analyst") return "analyst";
    if (v === "ops") return "ops";
    // Auth0 role mapping: Imprint-Operator should land on operator/ops dashboard.
    if (v === "imprint-operator" || v === "imprint_operator" || v === "imprint operator") {
      return "ops";
    }
  }
  return null;
}

export function can(role: AppRole, action: Action): boolean {
  return MAP[role].has(action);
}
