@ignore
Feature: Seed a fixture (POST /test/seed)

  Call with { session, fixture }.

  Scenario:
    * configure headers = null
    Given url baseUrl
    And path 'test', 'seed'
    And header X-Test-Session = session
    And request { fixtures: ['#(fixture)'] }
    When method post
    Then status 201
