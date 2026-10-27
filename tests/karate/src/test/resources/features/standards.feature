Feature: API standards, security basics, observability and test sessions (PLS-10, 13.1, 24, 25, 28)

  Background:
    * url baseUrl
    * def Schemas = Java.type('playlab.Schemas')
    * def Race = Java.type('playlab.Race')
    * def Jwt = Java.type('playlab.Jwt')
    * def session = callonce read('classpath:common/session.feature')
    * def sid = session.id
    * configure headers = { 'X-Test-Session': '#(sid)' }
    * def newUser = function(role) { return karate.call('classpath:common/user.feature', { session: sid, role: role }) }
    * def newSession = function() { return karate.call('classpath:common/session.feature').id }
    * def asHeaders = function(u) { var h = { 'X-Test-Session': sid }; if (u) h.Authorization = 'Bearer ' + u.token; return h }

  @PLS-10.1 @PLS-25.1
  Scenario Outline: PLS-10.1 <what> returns <status> in the one error shape, with the correlation ID in body and header
    * def u = !role ? null : newUser(role)
    Given url baseUrl + '/api/v1/' + path
    And headers asHeaders(u)
    When method get
    Then match responseStatus == parseInt(status)
    And match Schemas.check('Error', response) == []
    And match karate.keysOf(response.error) == ['code', 'message', 'details', 'correlationId']
    And match response.error.correlationId == responseHeaders['X-Correlation-Id'][0]

    Examples:
      | what            | path            | role     | status |
      | an unknown path | no-such-route   |          | 404    |
      | an unknown id   | products/99999  |          | 404    |
      | no token        | orders          |          | 401    |
      | the wrong role  | admin/users     | customer | 403    |
      | a bad limit     | products?limit=0 |         | 422    |

  @PLS-25.1
  Scenario: PLS-25.1 a valid correlation ID is echoed back, an invalid one is replaced by a UUID
    Given path 'api', 'v1', 'categories'
    And header X-Correlation-Id = 'karate-trace-1'
    When method get
    Then match responseHeaders['X-Correlation-Id'][0] == 'karate-trace-1'
    Given path 'api', 'v1', 'categories'
    And header X-Correlation-Id = 'not valid!'
    When method get
    Then match responseHeaders['X-Correlation-Id'][0] == '#regex [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

  @PLS-25.2 @PLS-25.3
  Scenario: PLS-25.2 a request's log line has every field, and the password in it is redacted
    * def u = newUser('customer')
    * def id = 'karate-log-' + java.util.UUID.randomUUID()
    Given path 'api', 'v1', 'auth', 'login'
    And header X-Correlation-Id = id
    And request { email: '#(u.user.email)', password: '#(u.password)' }
    When method post
    Then status 200
    Given path 'test', 'logs'
    And param correlationId = id
    When method get
    Then status 200
    And match response.data == '#[1]'
    * def line = response.data[0]
    * match line contains { correlationId: '#(id)', method: 'POST', route: '/api/v1/auth/login', status: 200, testSession: '#(sid)', defects: [] }
    * match line.durationMs == '#number'
    * match line.req.body == { email: '#(u.user.email)', password: '[REDACTED]' }
    * match karate.toString(line) !contains u.password

  @PLS-24.2
  Scenario: PLS-24.2 an unsigned token and a token signed with another key are both refused with 401
    * def u = newUser('customer')
    * def claims = Jwt.claimsOf(u.token)
    * def unsigned = Jwt.forge(claims, 'none', '')
    * def wrongKey = Jwt.forge(claims, 'HS256', 'not-the-servers-secret')
    Given path 'api', 'v1', 'auth', 'me'
    And header Authorization = 'Bearer ' + u.token
    When method get
    Then status 200
    Given path 'api', 'v1', 'auth', 'me'
    And header Authorization = 'Bearer ' + unsigned
    When method get
    Then status 401
    Given path 'api', 'v1', 'auth', 'me'
    And header Authorization = 'Bearer ' + wrongKey
    When method get
    Then status 401

  @PLS-24.3
  Scenario: PLS-24.3 a registered and an unknown email get the same failed-login answer
    * def u = newUser('customer')
    * def known = karate.call('classpath:common/login.feature', { session: sid, email: u.user.email, password: 'wrong-password' })
    * def unknown = karate.call('classpath:common/login.feature', { session: sid, email: 'nobody-at-all@playlab.test', password: 'wrong-password' })
    * match known.status == unknown.status
    * match known.body.error.code == unknown.body.error.code
    * match known.body.error.message == unknown.body.error.message

  @PLS-24.13
  Scenario: PLS-24.13 the retired /api/v0/orders route is a 404
    Given path 'api', 'v0', 'orders'
    When method get
    Then status 404

  @PLS-10.4
  Scenario Outline: PLS-10.4 GET <path> matches the <schema> schema
    * def u = !role ? null : newUser(role)
    * def target = path.replace('{productId}', '' + productId('EL-001'))
    Given url baseUrl + target
    And headers asHeaders(u)
    When method get
    Then status 200
    And match header Content-Type contains 'application/json'
    And match Schemas.check(schema, response) == []

    Examples:
      | path                              | schema          | role     |
      | /api/v1/health                    | Health          |          |
      | /api/v1/products?limit=3          | ProductList     |          |
      | /api/v1/products/{productId}      | ProductEnvelope |          |
      | /api/v1/products/{productId}/reviews | ReviewList   |          |
      | /api/v1/cart                      | Cart            | customer |
      | /api/v1/wishlist                  | Wishlist        | customer |
      | /api/v1/orders                    | OrderList       | customer |
      | /api/v1/auth/me                   | UserEnvelope    | customer |
      | /test/clock                       | ClockState      |          |

  @PLS-10.4
  Scenario: PLS-10.4 every store, category and admin user in a list matches its item schema
    * def admin = newUser('admin')
    Given path 'api', 'v1', 'stores'
    When method get
    Then status 200
    * def badStores = karate.filter(response.data, function(s) { return Schemas.check('Store', s).length > 0 })
    * match badStores == []
    Given path 'api', 'v1', 'categories'
    When method get
    * def badCategories = karate.filter(response.data, function(c) { return Schemas.check('CategoryWithCount', c).length > 0 })
    * match badCategories == []
    Given path 'api', 'v1', 'admin', 'users'
    And header Authorization = 'Bearer ' + admin.token
    And param limit = 5
    When method get
    * def badUsers = karate.filter(response.data, function(u) { return Schemas.check('AdminUser', u).length > 0 })
    * match badUsers == []

  @PLS-13.1
  Scenario: PLS-13.1 the 3 nearest stores to Galway are Galway, Limerick and Athlone, nearest first
    Given path 'api', 'v1', 'stores', 'nearest'
    And params { lat: 53.2724, lng: -9.0532 }
    When method get
    Then status 200
    And match response.data[*].id == ['galway', 'limerick', 'athlone']
    * def km = karate.jsonPath(response, '$.data[*].distanceKm')
    * match km == karate.sort(km, function(x) { return x })

  @PLS-10.3
  Scenario: PLS-10.3 a shopper who uses up the rate limit gets 429 with Retry-After
    * configure headers = null
    # The limit is counted per session, so this one has a session of its own.
    * if (rateLimitPerMin == 0) karate.abort()
    * def own = newSession()
    * def statuses = Race.get(baseUrl + '/api/v1/categories', own, rateLimitPerMin, false)
    * def failed = karate.filter(statuses, function(s) { return s != 200 })
    * match failed == []
    Given path 'api', 'v1', 'categories'
    And header X-Test-Session = own
    When method get
    Then status 429
    And match response.error.code == 'RATE_LIMITED'
    And match responseHeaders['Retry-After'][0] == '#regex \\d+'

  @PLS-24.6
  Scenario: PLS-24.6 changing X-Forwarded-For does not get a fresh rate limit
    * configure headers = null
    * if (rateLimitPerMin == 0) karate.abort()
    * def own = newSession()
    * def used = Race.get(baseUrl + '/api/v1/categories', own, rateLimitPerMin, true)
    * def blocked = Race.get(baseUrl + '/api/v1/categories', own, 5, true)
    * def allowed = karate.filter(blocked, function(s) { return s != 429 })
    * match allowed == []

  @PLS-25.4 @PLS-25.5
  Scenario: PLS-25.4 /metrics has the request histogram and the gauges, is never rate limited, and its defects gauge follows the session
    * configure headers = null
    Given path 'metrics'
    When method get
    Then status 200
    And match header Content-Type contains 'text/plain'
    And match response contains 'http_request_duration_seconds_bucket'
    And match response contains 'playlab_orders_created_total'
    And match response contains 'playlab_payments_declined_total'
    And match response contains 'playlab_db_pool_connections{state="total"}'
    And match response contains 'playlab_defects_active 0'
    * def own = newSession()
    * def scraped = Race.get(baseUrl + '/metrics', own, rateLimitPerMin + 5, false)
    * def limited = karate.filter(scraped, function(s) { return s != 200 })
    * match limited == []
    * call read('classpath:common/defects.feature') { session: '#(own)', enable: ['wrong-status-code', 'order-leak'] }
    Given path 'metrics'
    And header X-Test-Session = own
    When method get
    Then match response contains 'playlab_defects_active 2'

  @PLS-28.6
  Scenario: PLS-28.6 POST /test/sessions returns the session id and sets the test_session cookie
    Given path 'test', 'sessions'
    When method post
    Then status 201
    And match response.id == '#regex [0-9a-f-]{36}'
    And match response.idleTimeoutMs == '#number'
    And match responseHeaders['Set-Cookie'][0] contains 'test_session=' + response.id

  @PLS-28.1
  Scenario: PLS-28.1 a defect and a clock move in one session do not touch another session, or a request with no session
    * configure headers = null
    * def a = newSession()
    * def b = newSession()
    * call read('classpath:common/defects.feature') { session: '#(a)', enable: ['wrong-status-code'] }
    * def loginStatus = function(s) { return karate.call('classpath:common/empty-login.feature', { session: s }).status }
    * match loginStatus(a) == 500
    * match loginStatus(b) == 422
    * match loginStatus(null) == 422
    Given path 'test', 'clock'
    And header X-Test-Session = a
    And request { now: '2030-01-01T00:00:00.000Z' }
    When method post
    Then status 200
    Given path 'test', 'clock'
    And header X-Test-Session = b
    When method get
    Then match response.offsetMs == 0

  @PLS-28.7
  Scenario: PLS-28.7 one session's latency rule does not slow another
    * configure headers = null
    * def a = newSession()
    * def b = newSession()
    Given path 'test', 'latency'
    And header X-Test-Session = a
    And request { path: '/api/v1/categories', delayMs: 400 }
    When method post
    Then status 201
    * def timed = function(s) { var t = java.lang.System.currentTimeMillis(); karate.call('classpath:common/get-categories.feature', { session: s }); return java.lang.System.currentTimeMillis() - t }
    * assert timed(a) >= 400
    * assert timed(b) < 400
