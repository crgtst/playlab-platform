@ignore
Feature: Switch defects on in a session

  Scenario:
    * configure headers = null
    Given url baseUrl
    And path 'test', 'bugs'
    And header X-Test-Session = session
    And request { enable: '#(enable)' }
    When method post
    Then status 200
