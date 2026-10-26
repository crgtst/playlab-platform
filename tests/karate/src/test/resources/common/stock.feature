@ignore
Feature: The stock of a seeded product right now

  Call with { session, sku }. Returns stock.

  Scenario:
    * configure headers = null
    * def pid = productId(sku)
    Given url baseUrl
    And path 'api', 'v1', 'products', pid
    And header X-Test-Session = session
    When method get
    Then status 200
    * def stock = response.data.stock
