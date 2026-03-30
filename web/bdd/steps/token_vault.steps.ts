import assert from "node:assert";
import { After, Before, Given, Then, When } from "@cucumber/cucumber";
import { assertTokenVaultConfig, isTokenVaultSigningMode } from "@/lib/server/token-vault";
import { type AimmeWorld } from "../support/world";

const ENV_KEYS = ["POLYGON_SIGNING_MODE", "TOKEN_VAULT_URL", "AUTH0_IMPRINT_AUDIENCE"] as const;

Before(function (this: AimmeWorld) {
  this.envSnapshot = {};
  for (const k of ENV_KEYS) {
    this.envSnapshot[k] = process.env[k];
  }
});

After(function (this: AimmeWorld) {
  for (const k of ENV_KEYS) {
    const v = this.envSnapshot[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

Given("POLYGON_SIGNING_MODE is {string}", function (this: AimmeWorld, mode: string) {
  if (mode === "unset") delete process.env.POLYGON_SIGNING_MODE;
  else process.env.POLYGON_SIGNING_MODE = mode;
});

Given("TOKEN_VAULT_URL is {string}", function (this: AimmeWorld, url: string) {
  if (url === "unset") delete process.env.TOKEN_VAULT_URL;
  else process.env.TOKEN_VAULT_URL = url;
});

Given("AUTH0_IMPRINT_AUDIENCE is {string}", function (this: AimmeWorld, aud: string) {
  if (aud === "unset") delete process.env.AUTH0_IMPRINT_AUDIENCE;
  else process.env.AUTH0_IMPRINT_AUDIENCE = aud;
});

When("assertTokenVaultConfig is invoked", function (this: AimmeWorld) {
  this.lastError = null;
  try {
    assertTokenVaultConfig();
  } catch (e) {
    this.lastError = e instanceof Error ? e.message : String(e);
  }
});

Then("no configuration error is thrown", function (this: AimmeWorld) {
  assert.strictEqual(this.lastError, null);
});

Then("a configuration error containing {string} is thrown", function (this: AimmeWorld, fragment: string) {
  assert.ok(this.lastError, "expected an error");
  assert.ok(
    this.lastError.includes(fragment),
    `expected error to include "${fragment}", got: ${this.lastError}`,
  );
});

Then("isTokenVaultSigningMode should be {string}", function (this: AimmeWorld, expected: string) {
  const want = expected === "true";
  assert.strictEqual(isTokenVaultSigningMode(), want);
});
