# language: en
@vault @config
Feature: Token Vault signing configuration
  When POLYGON_SIGNING_MODE is vault, required env vars must be present before approve/sign calls.

  Scenario: Local mode does not require vault env vars
    Given POLYGON_SIGNING_MODE is "local"
    And TOKEN_VAULT_URL is "unset"
    And AUTH0_IMPRINT_AUDIENCE is "unset"
    When assertTokenVaultConfig is invoked
    Then no configuration error is thrown
    And isTokenVaultSigningMode should be "false"

  Scenario: Vault mode is detected from environment
    Given POLYGON_SIGNING_MODE is "vault"
    Then isTokenVaultSigningMode should be "true"

  Scenario: Vault mode requires TOKEN_VAULT_URL
    Given POLYGON_SIGNING_MODE is "vault"
    And TOKEN_VAULT_URL is "unset"
    And AUTH0_IMPRINT_AUDIENCE is "https://api.example/imprint"
    When assertTokenVaultConfig is invoked
    Then a configuration error containing "TOKEN_VAULT_URL" is thrown

  Scenario: Vault mode requires AUTH0_IMPRINT_AUDIENCE
    Given POLYGON_SIGNING_MODE is "vault"
    And TOKEN_VAULT_URL is "https://vault.example"
    And AUTH0_IMPRINT_AUDIENCE is "unset"
    When assertTokenVaultConfig is invoked
    Then a configuration error containing "AUTH0_IMPRINT_AUDIENCE" is thrown

  Scenario: Vault mode passes when required vars are set
    Given POLYGON_SIGNING_MODE is "vault"
    And TOKEN_VAULT_URL is "https://vault.example"
    And AUTH0_IMPRINT_AUDIENCE is "https://tenant.us.auth0.com/api/v2/"
    When assertTokenVaultConfig is invoked
    Then no configuration error is thrown
