@ignore
Feature: Add a product to a user's cart

  Call with { session, token, sku, quantity }. Returns the cart.

  Scenario:
    * configure headers = null
    * def pid = productId(sku)
    Given url baseUrl
    And path 'api', 'v1', 'cart', 'items'
    And header X-Test-Session = session
    And header Authorization = 'Bearer ' + token
    And request { productId: '#(pid)', quantity: '#(quantity)' }
    When method post
    Then status 201
    * def cart = response
