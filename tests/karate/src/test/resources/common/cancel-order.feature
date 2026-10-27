@ignore
Feature: Cancel an order as an admin (puts the stock back)

  Call with { session, adminToken, id }.

  Scenario:
    * configure headers = null
    Given url baseUrl
    And path 'api', 'v1', 'orders', id, 'status'
    And header X-Test-Session = session
    And header Authorization = 'Bearer ' + adminToken
    And header If-Match = '*'
    And request { status: 'cancelled' }
    When method patch
    Then status 200
