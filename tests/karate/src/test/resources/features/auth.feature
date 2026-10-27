Feature: Login, session, lockout and expiry (PLS-1)

  Background:
    * url baseUrl
    * def Schemas = Java.type('playlab.Schemas')
    * def session = callonce read('classpath:common/session.feature')
    * def sid = session.id
    * configure headers = { 'X-Test-Session': '#(sid)' }
    * def newUser = function(role) { return karate.call('classpath:common/user.feature', { session: sid, role: role }) }

  @PLS-1.1
  Scenario: PLS-1.1 a customer logs in and gets a session for their own account
    * def u = newUser('customer')
    Given path 'api', 'v1', 'auth', 'login'
    And request { email: '#(u.user.email)', password: '#(u.password)' }
    When method post
    Then status 200
    And match Schemas.check('Session', response) == []
    And match response.tokenType == 'Bearer'
    And match response.user.email == u.user.email

  @PLS-1.2
  Scenario: PLS-1.2 a wrong password is refused with the standard message and no cookie
    * def u = newUser('customer')
    Given path 'api', 'v1', 'auth', 'login'
    And request { email: '#(u.user.email)', password: 'wrong-password' }
    When method post
    Then status 401
    And match Schemas.check('Error', response) == []
    And match response.error.message == 'Email or password is incorrect'
    * def setCookies = responseHeaders['Set-Cookie'] || []
    * def loginCookies = karate.filter(setCookies, function(c) { return c.startsWith('session=') || c.startsWith('refresh_token=') })
    And match loginCookies == []

  @PLS-1.3
  Scenario: PLS-1.3 the sixth attempt after five failures is locked out with 423
    * def own = karate.call('classpath:common/session.feature')
    * def u = karate.call('classpath:common/user.feature', { session: own.id, role: 'customer' })
    * def attempt = function(i) { return karate.call('classpath:common/login.feature', { session: own.id, email: u.user.email, password: 'wrong-password' }).status }
    * def statuses = karate.repeat(5, attempt)
    * match statuses == [401, 401, 401, 401, 401]
    * def sixth = karate.call('classpath:common/login.feature', { session: own.id, email: u.user.email, password: u.password })
    * match sixth.status == 423
    * match sixth.body.error.code == 'ACCOUNT_LOCKED'

  @PLS-1.4
  Scenario: PLS-1.4 after logging out, the refresh token no longer works
    * def u = newUser('customer')
    * def login = call read('classpath:common/login.feature') { session: '#(sid)', email: '#(u.user.email)', password: '#(u.password)' }
    * def refreshToken = login.body.refreshToken
    Given path 'api', 'v1', 'auth', 'logout'
    And request { refreshToken: '#(refreshToken)' }
    When method post
    Then status 204
    Given path 'api', 'v1', 'auth', 'refresh'
    And request { refreshToken: '#(refreshToken)' }
    When method post
    Then status 401

  @PLS-1.5
  Scenario: PLS-1.5 an access token older than 15 minutes is refused with 401 TOKEN_EXPIRED
    * configure headers = null
    # The clock is the session's, so this uses a session of its own.
    * def own = karate.call('classpath:common/session.feature')
    * def u = karate.call('classpath:common/user.feature', { session: own.id, role: 'customer' })
    Given path 'test', 'clock'
    And header X-Test-Session = own.id
    And request { advanceMs: 960000 }
    When method post
    Then status 200
    Given path 'api', 'v1', 'auth', 'me'
    And header X-Test-Session = own.id
    And header Authorization = 'Bearer ' + u.token
    When method get
    Then status 401
    And match response.error.code == 'TOKEN_EXPIRED'

  @PLS-1.6
  Scenario: PLS-1.6 a valid refresh token returns a new access token
    * def u = newUser('customer')
    * def login = call read('classpath:common/login.feature') { session: '#(sid)', email: '#(u.user.email)', password: '#(u.password)' }
    Given path 'api', 'v1', 'auth', 'refresh'
    And request { refreshToken: '#(login.body.refreshToken)' }
    When method post
    Then status 200
    And match Schemas.check('Session', response) == []
    And match response.accessToken == '#string'
