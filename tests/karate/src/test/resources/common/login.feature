@ignore
Feature: One login attempt

  Call with { session, email, password }. Returns status, response, and (on success) the tokens.

  Scenario:
    * configure headers = null
    Given url baseUrl
    And path 'api', 'v1', 'auth', 'login'
    And header X-Test-Session = session
    And request { email: '#(email)', password: '#(password)' }
    When method post
    * def status = responseStatus
    * def body = response
