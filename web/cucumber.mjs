/** @type {import("@cucumber/cucumber/lib/configuration/types.js").IConfiguration} */
export default {
  paths: ["bdd/features/**/*.feature"],
  import: ["bdd/support/world.ts", "bdd/steps/**/*.ts"],
  format: ["progress"],
  formatOptions: { snippetInterface: "async-await" },
};
