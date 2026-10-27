@ignore
Feature: One page of the product list

  Call with { session, query } (a query string such as sort=price_asc&page=2). Returns body.

  Scenario:
    * configure headers = null
    Given url baseUrl + '/api/v1/products?' + query
    And header X-Test-Session = session
    When method get
    Then status 200
    * def body = response
