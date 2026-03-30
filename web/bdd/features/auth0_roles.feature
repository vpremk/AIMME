# language: en
@auth0 @roles
Feature: Auth0 role normalization
  Map IdP role strings into AIMME app roles used by dashboards and RBAC.

  Scenario Outline: Imprint-Operator maps to ops
    Given an Auth0 role claim of "<raw>"
    When the role is normalized
    Then the normalized app role should be "ops"

    Examples:
      | raw               |
      | Imprint-Operator  |
      | imprint-operator  |
      | IMPRINT_OPERATOR  |

  Scenario Outline: Standard role passthrough
    Given an Auth0 role claim of "<raw>"
    When the role is normalized
    Then the normalized app role should be "<expected>"

    Examples:
      | raw    | expected |
      | trader | trader   |
      | ops    | ops      |
      | analyst| analyst  |

  Scenario: Unknown role string does not normalize
    Given an Auth0 role claim of "unknown-role-xyz"
    When the role is normalized
    Then the normalized app role should be "null"
