@ignore
Feature: Apply a discount code to a user's cart

  Call with { session, token, code }. Returns status and body.

  Scenario:
    * configure headers = null
    Given url baseUrl
    And path 'api', 'v1', 'cart', 'discount'
    And header X-Test-Session = session
    And header Authorization = 'Bearer ' + token
    And request { code: '#(code)' }
    When method post
    * def status = responseStatus
    * def body = response
