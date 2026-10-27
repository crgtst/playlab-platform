@ignore
Feature: A login with an empty body, which is a validation failure (422, or 500 with wrong-status-code on)

  Call with { session } (null for no session). Returns status.

  Scenario:
    * configure headers = null
    * def session = karate.get('session')
    * def hdrs = session ? { 'X-Test-Session': session } : {}
    Given url baseUrl
    And path 'api', 'v1', 'auth', 'login'
    And headers hdrs
    And request {}
    When method post
    * def status = responseStatus
