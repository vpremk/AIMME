import assert from "node:assert";
import { Given, Then, When } from "@cucumber/cucumber";
import { can, normalizeRole, type Action, type AppRole } from "@/lib/permissions";
import { type AimmeWorld } from "../support/world";

Given("an Auth0 role claim of {string}", function (this: AimmeWorld, raw: string) {
  this.rawRole = raw === "<empty>" ? "" : raw;
});

When("the role is normalized", function (this: AimmeWorld) {
  this.normalizedRole = normalizeRole(this.rawRole);
});

Then("the normalized app role should be {string}", function (this: AimmeWorld, expected: string) {
  const want = expected === "null" ? null : (expected as AppRole);
  assert.strictEqual(this.normalizedRole, want);
});

Given("app role {string}", function (this: AimmeWorld, role: string) {
  this.role = role as AppRole;
});

Given("permission {string}", function (this: AimmeWorld, action: string) {
  this.action = action;
});

When("checking if the role may perform the action", function (this: AimmeWorld) {
  this.canResult = can(this.role, this.action as Action);
});

Then("access should be granted", function (this: AimmeWorld) {
  assert.strictEqual(this.canResult, true);
});

Then("access should be denied", function (this: AimmeWorld) {
  assert.strictEqual(this.canResult, false);
});
