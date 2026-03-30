# language: en
@rbac
Feature: Role-based access control
  Trader, analyst, and ops roles have distinct permissions for signals and admin paths.

  Scenario: Trader can submit market events
    Given app role "trader"
    And permission "signals.write"
    When checking if the role may perform the action
    Then access should be granted

  Scenario: Analyst can read signals only
    Given app role "analyst"
    And permission "signals.read"
    When checking if the role may perform the action
    Then access should be granted

  Scenario: Analyst cannot submit market events
    Given app role "analyst"
    And permission "signals.write"
    When checking if the role may perform the action
    Then access should be denied

  Scenario: Ops can read registered users (admin)
    Given app role "ops"
    And permission "admin.users.read"
    When checking if the role may perform the action
    Then access should be granted
