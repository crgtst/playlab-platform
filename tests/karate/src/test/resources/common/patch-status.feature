@ignore
Feature: Change an order's status

  Call with { session, token, id, status, ifMatch }. `ifMatch` may be null to send no header. Returns status and body.

  Scenario:
    * configure headers = null
    * def ifMatch = karate.get('ifMatch')
    * def hdrs = { 'X-Test-Session': '#(session)', Authorization: '#("Bearer " + token)' }
    * if (ifMatch) hdrs['If-Match'] = ifMatch
    Given url baseUrl
    And path 'api', 'v1', 'orders', id, 'status'
    And headers hdrs
    And request { status: '#(status)' }
    When method patch
    * def status = responseStatus
    * def body = response
