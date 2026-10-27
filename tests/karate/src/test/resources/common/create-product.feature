@ignore
Feature: Create a product as an admin

  Call with { session, adminToken, body }. Returns the product.

  Scenario:
    * configure headers = null
    Given url baseUrl
    And path 'api', 'v1', 'products'
    And header X-Test-Session = session
    And header Authorization = 'Bearer ' + adminToken
    And request body
    When method post
    Then status 201
    * def product = response.data
