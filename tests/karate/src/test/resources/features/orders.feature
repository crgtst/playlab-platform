Feature: Orders: checkout, history, access, lifecycle and locking (PLS-6, 7, 20, 21, 24)

  Background:
    * url baseUrl
    * def Schemas = Java.type('playlab.Schemas')
    * def Race = Java.type('playlab.Race')
    * def session = callonce read('classpath:common/session.feature')
    * def sid = session.id
    * configure headers = { 'X-Test-Session': '#(sid)' }
    * def newUser = function(role) { return karate.call('classpath:common/user.feature', { session: sid, role: role }) }
    * def admin = callonce read('classpath:common/user.feature') { session: '#(session.id)', role: 'admin' }
    * def SKU = 'SP-003'
    * def stockOf = function(sku) { return karate.call('classpath:common/stock.feature', { session: sid, sku: sku }).stock }
    * def addItem = function(u, sku, qty) { return karate.call('classpath:common/add-to-cart.feature', { session: sid, token: u.token, sku: sku, quantity: qty }).cart }
    * def placeOrder = function(u, card, key) { return karate.call('classpath:common/place-order.feature', { session: sid, token: u.token, card: card, key: key }) }
    # Orders a scenario places are cancelled afterwards, which puts the stock back.
    * def created = []
    * def track = function(order) { created.push(order.id); return order }
    * configure afterScenario =
      """
      function() {
        var ids = karate.get('created') || [];
        for (var i = 0; i < ids.length; i++) {
          karate.call('classpath:common/cancel-order.feature', { session: karate.get('sid'), adminToken: karate.get('admin').token, id: ids[i] });
        }
      }
      """
    # A scenario that moves an order past cancellable states ends with the order still open; tidy those with a flag.
    * def patchStatus = function(u, id, status, ifMatch) { return karate.call('classpath:common/patch-status.feature', { session: sid, token: u.token, id: id, status: status, ifMatch: ifMatch }) }

  @PLS-6.1
  Scenario: PLS-6.1 paying with the success card creates a paid order and takes the stock
    # Scenarios run in parallel, so one that checks stock has a product of its own (SP-006 here).
    * def SKU = 'SP-006'
    * def buyer = newUser('customer')
    * def before = stockOf(SKU)
    * def cart = addItem(buyer, SKU, 2)
    * def paid = placeOrder(buyer)
    * match paid.status == 201
    * def order = track(paid.body.data)
    * match Schemas.check('OrderEnvelope', paid.body) == []
    * match order contains { status: 'paid', cardLast4: '4242' }
    * match order.number == '#regex PL-\\d{6}'
    * match paid.headers['Location'][0] == '/api/v1/orders/' + order.id
    * match order.totals == cart.totals
    * match stockOf(SKU) == before - 2
    Given path 'api', 'v1', 'cart'
    And header Authorization = 'Bearer ' + buyer.token
    When method get
    Then match response.itemCount == 0

  @PLS-10.5
  Scenario: PLS-10.5 the same Idempotency-Key a second time is a replay of the first order, not a second order
    * def buyer = newUser('customer')
    * def cart = addItem(buyer, SKU, 1)
    * def key = 'karate-' + java.util.UUID.randomUUID()
    * def first = placeOrder(buyer, null, key)
    * match first.status == 201
    * def order = track(first.body.data)
    * def again = placeOrder(buyer, null, key)
    * match again.status == 200
    * match again.body.data.id == order.id
    * match again.headers['Idempotent-Replayed'][0] == 'true'

  @PLS-6.2
  Scenario: PLS-6.2 a declined card returns 402, creates no order and keeps the cart
    * def buyer = newUser('customer')
    * def cart = addItem(buyer, SKU, 1)
    * def declined = placeOrder(buyer, shared.cards.decline.number)
    * match declined.status == 402
    * match declined.body.error.code == 'PAYMENT_DECLINED'
    * match Schemas.check('Error', declined.body) == []
    Given path 'api', 'v1', 'orders'
    And header Authorization = 'Bearer ' + buyer.token
    When method get
    Then match response.meta.total == 0
    Given path 'api', 'v1', 'cart'
    And header Authorization = 'Bearer ' + buyer.token
    When method get
    Then match response.itemCount == 1

  @PLS-6.2
  Scenario: PLS-6.2 a card number that fails the check digit is a 422 on payment.cardNumber
    * def buyer = newUser('customer')
    * def cart = addItem(buyer, SKU, 1)
    * def invalid = placeOrder(buyer, shared.cards.invalid.number)
    * match invalid.status == 422
    * match invalid.body.error.details[*].field contains 'payment.cardNumber'

  @PLS-6.3
  Scenario: PLS-6.3 a payment provider that does not answer returns 504
    * def buyer = newUser('customer')
    * def cart = addItem(buyer, SKU, 1)
    * def timedOut = placeOrder(buyer, shared.cards.timeout.number)
    * match timedOut.status == 504
    * match timedOut.body.error.code == 'PAYMENT_TIMEOUT'

  @PLS-6.7
  Scenario: PLS-6.7 a price or total sent by the client is ignored
    * def buyer = newUser('customer')
    * def cart = addItem(buyer, SKU, 1)
    * def body = orderBody()
    * eval body.totals = { totalCents: 1 }
    * eval body.items = [{ productId: productId(SKU), unitPriceCents: 1 }]
    Given path 'api', 'v1', 'orders'
    And header Authorization = 'Bearer ' + buyer.token
    And request body
    When method post
    Then status 201
    * def order = track(response.data)
    * match order.totals.totalCents != 1
    * match order.totals == cart.totals

  @PLS-6.4
  Scenario: PLS-6.4 two payments at the same moment create exactly one order
    * def buyer = newUser('customer')
    * def cart = addItem(buyer, SKU, 1)
    * def results = Race.post(baseUrl + '/api/v1/orders', sid, [buyer.token, buyer.token], karate.pretty(orderBody()))
    * def statuses = karate.map(results, function(r) { return r.status })
    * def created201 = karate.filter(statuses, function(s) { return s == 201 })
    * match created201 == '#[1]'
    * def made = karate.filter(results, function(r) { return r.status == 201 })
    * karate.forEach(made, function(r) { track(karate.fromString(r.body).data) })
    Given path 'api', 'v1', 'orders'
    And header Authorization = 'Bearer ' + buyer.token
    When method get
    Then match response.meta.total == 1

  @PLS-7.1
  Scenario: PLS-7.1 order history lists the customer's own orders, newest first, and nobody else's
    * def buyer = newUser('customer')
    * def other = newUser('customer')
    * def cartOne = addItem(buyer, SKU, 1)
    * def one = track(placeOrder(buyer).body.data)
    * def cartTwo = addItem(buyer, SKU, 1)
    * def two = track(placeOrder(buyer).body.data)
    Given path 'api', 'v1', 'orders'
    And header Authorization = 'Bearer ' + buyer.token
    When method get
    Then status 200
    And match Schemas.check('OrderList', response) == []
    And match karate.jsonPath(response, '$.data[*].id') == ['#(two.id)', '#(one.id)']
    Given path 'api', 'v1', 'orders'
    And header Authorization = 'Bearer ' + other.token
    When method get
    Then match response.meta.total == 0

  @PLS-7.2 @PLS-24.1
  Scenario: PLS-7.2 another customer's order is a 404 to read, track or cancel
    * def buyer = newUser('customer')
    * def other = newUser('customer')
    * def cart = addItem(buyer, SKU, 1)
    * def order = track(placeOrder(buyer).body.data)
    Given path 'api', 'v1', 'orders', order.id
    And header Authorization = 'Bearer ' + other.token
    When method get
    Then status 404
    And match Schemas.check('Error', response) == []
    Given path 'api', 'v1', 'orders', order.id, 'tracking'
    And header Authorization = 'Bearer ' + other.token
    When method get
    Then status 404
    Given path 'api', 'v1', 'orders', order.id, 'cancel'
    And header Authorization = 'Bearer ' + other.token
    When method post
    Then status 404
    Given path 'api', 'v1', 'orders', order.id, 'tracking'
    And header Authorization = 'Bearer ' + buyer.token
    When method get
    Then status 200
    And match Schemas.check('Tracking', response.data) == []
    And match response.data.events[0].status == 'placed'

  @PLS-21.5
  Scenario: PLS-21.5 a status change needs the current ETag: stale is 412, missing is 428
    * def buyer = newUser('customer')
    * def cart = addItem(buyer, SKU, 1)
    * def order = track(placeOrder(buyer).body.data)
    * def stale = patchStatus(admin, order.id, 'processing', '"stale"')
    * match stale.status == 412
    * match stale.body.error.code == 'PRECONDITION_FAILED'
    * def missing = patchStatus(admin, order.id, 'processing', null)
    * match missing.status == 428
    * match missing.body.error.code == 'PRECONDITION_REQUIRED'

  @PLS-20.1 @PLS-21.6
  Scenario: PLS-20.1 an allowed move returns 200, and the ETag changes with the status
    * def buyer = newUser('customer')
    * def cart = addItem(buyer, SKU, 1)
    * def order = track(placeOrder(buyer).body.data)
    Given path 'api', 'v1', 'orders', order.id
    And header Authorization = 'Bearer ' + admin.token
    When method get
    * def etag = responseHeaders['ETag'][0]
    * def moved = patchStatus(admin, order.id, 'processing', etag)
    * match moved.status == 200
    * match Schemas.check('OrderEnvelope', moved.body) == []
    * match moved.body.data.status == 'processing'
    * match moved.body.data.etag != etag

  @PLS-20.2
  Scenario: PLS-20.2 going back a step is a 409 that says where it was, where it was going and what is allowed
    * def buyer = newUser('customer')
    * def cart = addItem(buyer, SKU, 1)
    * def order = track(placeOrder(buyer).body.data)
    * match patchStatus(admin, order.id, 'processing', '*').status == 200
    * def back = patchStatus(admin, order.id, 'paid', '*')
    * match back.status == 409
    * match back.body.error.code == 'INVALID_TRANSITION'
    * match back.body.error.details == { from: 'processing', to: 'paid', allowed: ['shipped', 'cancelled'] }

  @PLS-20.6
  Scenario: PLS-20.6 a customer can cancel a paid order but not one that is processing
    * def buyer = newUser('customer')
    * def cart = addItem(buyer, SKU, 2)
    * def before = stockOf(SKU)
    * def paid = track(placeOrder(buyer).body.data)
    * def cartTwo = addItem(buyer, SKU, 1)
    * def processing = track(placeOrder(buyer).body.data)
    * match patchStatus(admin, processing.id, 'processing', '*').status == 200
    Given path 'api', 'v1', 'orders', processing.id, 'cancel'
    And header Authorization = 'Bearer ' + buyer.token
    When method post
    Then status 409
    And match response.error.code == 'INVALID_TRANSITION'
    Given path 'api', 'v1', 'orders', paid.id, 'cancel'
    And header Authorization = 'Bearer ' + buyer.token
    When method post
    Then status 200
    And match response.data.status == 'cancelled'

  @PLS-20.4
  Scenario: PLS-20.4 a bulk change where one order cannot move changes none, and lists the one that cannot
    * def buyer = newUser('customer')
    * def cartOne = addItem(buyer, SKU, 1)
    * def moving = track(placeOrder(buyer).body.data)
    * def cartTwo = addItem(buyer, SKU, 1)
    * def stuck = track(placeOrder(buyer).body.data)
    * match patchStatus(admin, moving.id, 'processing', '*').status == 200
    Given path 'api', 'v1', 'orders', 'bulk-status'
    And header Authorization = 'Bearer ' + admin.token
    And request { ids: ['#(moving.id)', '#(stuck.id)'], status: 'shipped' }
    When method post
    Then status 409
    And match response.error.details.orders == '#[1]'
    And match response.error.details.orders[0] contains { id: '#(stuck.id)', from: 'paid' }
    Given path 'api', 'v1', 'orders', moving.id
    And header Authorization = 'Bearer ' + admin.token
    When method get
    Then match response.data.status == 'processing'

  @PLS-20.5
  Scenario: PLS-20.5 cancelling an order puts its stock back
    * def SKU = 'HK-008'
    * def buyer = newUser('customer')
    * def before = stockOf(SKU)
    * def cart = addItem(buyer, SKU, 3)
    * def order = placeOrder(buyer).body.data
    * match stockOf(SKU) == before - 3
    * match patchStatus(admin, order.id, 'processing', '*').status == 200
    * match patchStatus(admin, order.id, 'cancelled', '*').status == 200
    * match stockOf(SKU) == before

  @PLS-21.4
  Scenario: PLS-21.4 of 20 customers ordering the last item at the same moment, exactly one succeeds
    # SP-004's stock is set to 1 for the race and put back afterwards. Only this feature orders SP-004.
    * def RACE = 'SP-004'
    * def seededStock = product(RACE).stock
    * configure afterScenario =
      """
      function() {
        // Cancel the winning order first (which puts its item back), then set the stock to its seeded level.
        var ids = karate.get('created') || [];
        for (var i = 0; i < ids.length; i++) karate.call('classpath:common/cancel-order.feature', { session: karate.get('sid'), adminToken: karate.get('admin').token, id: ids[i] });
        karate.call('classpath:common/set-stock.feature', { session: karate.get('sid'), adminToken: karate.get('admin').token, sku: 'SP-004', stock: karate.get('seededStock') });
      }
      """
    * call read('classpath:common/set-stock.feature') { session: '#(sid)', adminToken: '#(admin.token)', sku: '#(RACE)', stock: 1 }
    * def racers = karate.repeat(20, function(i) { return newUser('customer') })
    * karate.forEach(racers, function(u) { addItem(u, RACE, 1) })
    * def tokens = karate.map(racers, function(u) { return u.token })
    * def results = Race.post(baseUrl + '/api/v1/orders', sid, tokens, karate.pretty(orderBody()))
    * def statuses = karate.map(results, function(r) { return r.status })
    * def won = karate.filter(statuses, function(s) { return s == 201 })
    * def lost = karate.filter(statuses, function(s) { return s == 409 })
    * match won == '#[1]'
    * match lost == '#[19]'
    * def winners = karate.filter(results, function(r) { return r.status == 201 })
    * karate.forEach(winners, function(r) { track(karate.fromString(r.body).data) })

  @PLS-24.9
  Scenario: PLS-24.9 two orders using a single-use code at the same moment: only one gets the discount
    * call read('classpath:common/seed.feature') { session: '#(sid)', fixture: 'single-use-discount' }
    * def one = newUser('customer')
    * def two = newUser('customer')
    * karate.forEach([one, two], function(u) { addItem(u, SKU, 2); karate.call('classpath:common/apply-code.feature', { session: sid, token: u.token, code: 'ONCE15' }) })
    * def results = Race.post(baseUrl + '/api/v1/orders', sid, [one.token, two.token], karate.pretty(orderBody()))
    * def accepted = karate.filter(results, function(r) { return r.status == 201 })
    * def placed = karate.map(accepted, function(r) { return karate.fromString(r.body).data })
    * karate.forEach(placed, function(o) { track(o) })
    * match placed == '#[_ > 0]'
    * def discounted = karate.filter(placed, function(o) { return o.discount !== null && o.discount !== undefined })
    * match discounted == '#[1]'
