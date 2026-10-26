@ignore
Feature: Set a seeded product's stock (as an admin)

  Call with { session, adminToken, sku, stock }.

  Scenario:
    * configure headers = null
    * def pid = productId(sku)
    Given url baseUrl
    And path 'api', 'v1', 'products', pid
    And header X-Test-Session = session
    And header Authorization = 'Bearer ' + adminToken
    And header If-Match = '*'
    And request { stock: '#(stock)' }
    When method patch
    Then status 200
