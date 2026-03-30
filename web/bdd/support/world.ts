import { type IWorldOptions, setWorldConstructor, World } from "@cucumber/cucumber";
import type { AppRole } from "@/lib/permissions";

/** Shared state for Gherkin step definitions (Auth0, RBAC, Token Vault). */
export class AimmeWorld extends World {
  /** Raw role string from Auth0 / IdP before normalization */
  rawRole = "";
  normalizedRole: AppRole | null = null;
  role: AppRole = "trader";
  action = "";
  lastError: string | null = null;
  canResult = false;
  envSnapshot: Record<string, string | undefined> = {};

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(AimmeWorld);
