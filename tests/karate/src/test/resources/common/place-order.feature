@ignore
Feature: Place an order for what is in a user's cart

  Call with { session, token, card, key }. `card` (default: the success card) and `key` (an Idempotency-Key) are optional.
  Returns status, body and headers.

  Scenario:
    * configure headers = null
    * def card = karate.get('card')
    * def key = karate.get('key')
    * def hdrs = { 'X-Test-Session': '#(session)', Authorization: '#("Bearer " + token)' }
    * if (key) hdrs['Idempotency-Key'] = key
    Given url baseUrl
    And path 'api', 'v1', 'orders'
    And headers hdrs
    And request orderBody(card)
    When method post
    * def status = responseStatus
    * def body = response
    * def headers = responseHeaders
