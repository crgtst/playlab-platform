@ignore
Feature: GET /categories in a session

  Scenario:
    * configure headers = null
    Given url baseUrl
    And path 'api', 'v1', 'categories'
    And header X-Test-Session = session
    When method get
    Then status 200
