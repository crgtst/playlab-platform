Feature: Cart and discount codes (PLS-4, PLS-5)

  Background:
    * url baseUrl
    * def Schemas = Java.type('playlab.Schemas')
    * def session = callonce read('classpath:common/session.feature')
    * def sid = session.id
    * configure headers = { 'X-Test-Session': '#(sid)' }
    * def newUser = function(role) { return karate.call('classpath:common/user.feature', { session: sid, role: role }) }
    * def adds = function(t) { return t.subtotalCents - t.discountCents + t.vatCents + t.deliveryCents == t.totalCents }
    * def addItem = function(u, sku, qty) { return karate.call('classpath:common/add-to-cart.feature', { session: sid, token: u.token, sku: sku, quantity: qty }).cart }

  @PLS-4.1
  Scenario: PLS-4.1 adding a product shows the count and line total, and the totals add up to the cent
    * def u = newUser('customer')
    Given path 'api', 'v1', 'cart', 'items'
    And header Authorization = 'Bearer ' + u.token
    And request { productId: '#(productId("EL-008"))', quantity: 2 }
    When method post
    Then status 201
    And match Schemas.check('Cart', response) == []
    And match response.itemCount == 2
    And match response.items[0].lineTotalCents == 2 * product('EL-008').priceCents
    And assert adds(response.totals)

  @PLS-4.2
  Scenario Outline: PLS-4.2 a quantity of <quantity> is refused with 422 on the quantity field
    * def u = newUser('customer')
    Given path 'api', 'v1', 'cart', 'items'
    And header Authorization = 'Bearer ' + u.token
    And request { productId: '#(productId("EL-008"))', quantity: '#(quantity)' }
    When method post
    Then status 422
    And match response.error.details[0].field == 'quantity'

    Examples:
      | quantity |
      | 0        |
      | -1       |
      | 100      |

  @PLS-4.3
  Scenario: PLS-4.3 asking for more than the stock is refused with 409 and says how many are left
    * def u = newUser('customer')
    Given path 'api', 'v1', 'cart', 'items'
    And header Authorization = 'Bearer ' + u.token
    And request { productId: '#(productId("EL-006"))', quantity: 4 }
    When method post
    Then status 409
    And match response.error.code == 'INSUFFICIENT_STOCK'
    And match response.error.details.available == 3

  @PLS-4.4
  Scenario: PLS-4.4 changing and removing a quantity keeps the totals exact
    * def u = newUser('customer')
    * def cart = addItem(u, 'EL-008', 1)
    Given path 'api', 'v1', 'cart', 'items', productId('EL-008')
    And header Authorization = 'Bearer ' + u.token
    And request { quantity: 3 }
    When method patch
    Then status 200
    And match response.totals.subtotalCents == 3 * product('EL-008').priceCents
    And assert adds(response.totals)
    Given path 'api', 'v1', 'cart', 'items', productId('EL-008')
    And header Authorization = 'Bearer ' + u.token
    When method delete
    Then status 200
    And match response.items == []
    And match response.totals.totalCents == 0

  @PLS-5.1
  Scenario: PLS-5.1 SAVE10 takes 10% off, VAT follows the discounted subtotal, and the total is exact
    * def u = newUser('customer')
    * def cart = addItem(u, 'EL-008', 2)
    Given path 'api', 'v1', 'cart', 'discount'
    And header Authorization = 'Bearer ' + u.token
    And request { code: 'SAVE10' }
    When method post
    Then status 200
    And match Schemas.check('Cart', response) == []
    * def t = response.totals
    * match t.discountCents == Math.round(t.subtotalCents * 0.1)
    * match t.vatCents == Math.round((t.subtotalCents - t.discountCents) * 0.23)
    * assert adds(t)

  @PLS-5.7
  Scenario: PLS-5.7 the code in lower case is the same code, applied once
    * def u = newUser('customer')
    * def cart = addItem(u, 'EL-008', 1)
    Given path 'api', 'v1', 'cart', 'discount'
    And header Authorization = 'Bearer ' + u.token
    And request { code: 'SAVE10' }
    When method post
    Then status 200
    Given path 'api', 'v1', 'cart', 'discount'
    And header Authorization = 'Bearer ' + u.token
    And request { code: 'save10' }
    When method post
    Then status 200
    And match response.discounts == '#[1]'
    And match response.discount.code == 'SAVE10'

  @PLS-5.4
  Scenario: PLS-5.4 a second code is refused, naming the one already applied
    * def u = newUser('customer')
    * def cart = addItem(u, 'EL-008', 1)
    * def apply = function(code) { return karate.call('classpath:common/apply-code.feature', { session: sid, token: u.token, code: code }) }
    * match apply('SAVE10').status == 200
    * def second = apply('FIXED20')
    * match second.status == 409
    * match second.body.error.code == 'DISCOUNT_ONE_PER_ORDER'
    * match second.body.error.details.applied == 'SAVE10'

  @PLS-5.3
  Scenario: PLS-5.3 an unknown code is refused with 422
    * def u = newUser('customer')
    * def cart = addItem(u, 'EL-008', 1)
    * def result = karate.call('classpath:common/apply-code.feature', { session: sid, token: u.token, code: 'NOT-A-CODE' })
    * match result.status == 422
    * match result.body.error.code == 'DISCOUNT_UNKNOWN'

  @PLS-5.2
  Scenario: PLS-5.2 an expired code is refused and the total is unchanged
    * call read('classpath:common/seed.feature') { session: '#(sid)', fixture: 'expired-discount' }
    * def u = newUser('customer')
    * def cart = addItem(u, 'EL-008', 1)
    * def result = karate.call('classpath:common/apply-code.feature', { session: sid, token: u.token, code: 'EXPIRED10' })
    * match result.status == 422
    * match result.body.error.code == 'DISCOUNT_EXPIRED'
    Given path 'api', 'v1', 'cart'
    And header Authorization = 'Bearer ' + u.token
    When method get
    And match response.totals.discountCents == 0

  @PLS-5.5
  Scenario: PLS-5.5 a code with a minimum spend is refused on a small cart, and removed if the cart shrinks below it
    * call read('classpath:common/seed.feature') { session: '#(sid)', fixture: 'min-spend-discount' }
    * def small = newUser('customer')
    * def cart = addItem(small, 'SP-003', 1)
    * def refused = karate.call('classpath:common/apply-code.feature', { session: sid, token: small.token, code: 'MIN50' })
    * match refused.status == 422
    * match refused.body.error.code == 'DISCOUNT_MIN_SPEND'
    * match refused.body.error.details.minSpendCents == 5000
    * def u = newUser('customer')
    * def big = addItem(u, 'SP-003', 6)
    * match karate.call('classpath:common/apply-code.feature', { session: sid, token: u.token, code: 'MIN50' }).status == 200
    Given path 'api', 'v1', 'cart', 'items', productId('SP-003')
    And header Authorization = 'Bearer ' + u.token
    And request { quantity: 2 }
    When method patch
    Then status 200
    And match response.discount == null
    And match response.totals.discountCents == 0
    And match response.notices[*].code contains 'DISCOUNT_REMOVED'

  @PLS-5.6
  Scenario: PLS-5.6 a fixed code larger than the cart never makes the total negative
    * def u = newUser('customer')
    * def cart = addItem(u, 'SP-003', 1)
    * def result = karate.call('classpath:common/apply-code.feature', { session: sid, token: u.token, code: 'FIXED20' })
    * match result.status == 200
    * assert result.body.totals.totalCents >= 0
