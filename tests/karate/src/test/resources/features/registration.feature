Feature: Registration and password reset (PLS-2)

  Background:
    * url baseUrl
    * def Schemas = Java.type('playlab.Schemas')
    * def session = callonce read('classpath:common/session.feature')
    * def sid = session.id
    * configure headers = { 'X-Test-Session': '#(sid)' }
    * def unique = function() { return java.util.UUID.randomUUID().toString().substring(0, 8) }

  @PLS-2.1
  Scenario: PLS-2.1 registering creates an unconfirmed customer and a confirmation email in the mailbox
    * def email = 'karate-' + unique() + '@playlab.test'
    Given path 'api', 'v1', 'auth', 'register'
    And request { name: 'Casey Registrant', email: '#(email)', password: 'Password123!' }
    When method post
    Then status 201
    And match Schemas.check('UserEnvelope', response) == []
    And match response.user contains { role: 'customer', emailVerified: false }
    Given path 'test', 'mailbox', email
    When method get
    Then status 200
    * def mail = karate.filter(response.data, function(m) { return m.type == 'confirm-email' })[0]
    * match mail.subject == 'Confirm your PlayLab Shop account'
    * match mail.link contains '/confirm-email?token='
    * def token = mail.link.split('token=')[1]
    Given path 'api', 'v1', 'auth', 'confirm-email'
    And request { token: '#(token)' }
    When method post
    Then status 200
    And match response.user.emailVerified == true

  @PLS-2.2
  Scenario: PLS-2.2 an email already in use is refused with 409 and the standard message
    * def email = 'karate-' + unique() + '@playlab.test'
    * def body = { name: 'Casey Registrant', email: '#(email)', password: 'Password123!' }
    Given path 'api', 'v1', 'auth', 'register'
    And request body
    When method post
    Then status 201
    Given path 'api', 'v1', 'auth', 'register'
    And request body
    When method post
    Then status 409
    And match response.error.code == 'EMAIL_IN_USE'
    And match response.error.message == 'An account with this email already exists'

  @PLS-2.3
  Scenario: PLS-2.3 a name with accents is accepted and comes back unchanged
    * def email = 'karate-' + unique() + '@playlab.test'
    Given path 'api', 'v1', 'auth', 'register'
    And request { name: 'Aoife Ní Bhriain', email: '#(email)', password: 'Password123!' }
    When method post
    Then status 201
    And match response.user.name == 'Aoife Ní Bhriain'

  @PLS-2.4
  Scenario: PLS-2.4 invalid details return 422 naming each field, not 500
    Given path 'api', 'v1', 'auth', 'register'
    And request { name: '', email: 'not-an-email', password: 'short' }
    When method post
    Then status 422
    And match Schemas.check('Error', response) == []
    And match response.error.details[*].field contains only ['name', 'email', 'password']

  @PLS-24.4
  Scenario: PLS-24.4 a role in the registration body is ignored
    * def email = 'karate-' + unique() + '@playlab.test'
    Given path 'api', 'v1', 'auth', 'register'
    And request { name: 'Eve Escalate', email: '#(email)', password: 'Password123!', role: 'admin' }
    When method post
    Then status 201
    And match response.user.role == 'customer'

  @PLS-2.5
  Scenario: PLS-2.5 a reset link chooses a new password once, and an unknown email gets the same answer
    * def u = karate.call('classpath:common/user.feature', { session: sid, role: 'customer' })
    Given path 'api', 'v1', 'auth', 'forgot-password'
    And request { email: '#(u.user.email)' }
    When method post
    Then status 202
    * def known = response
    Given path 'api', 'v1', 'auth', 'forgot-password'
    And request { email: 'nobody-at-all@playlab.test' }
    When method post
    Then status 202
    * match response == known
    Given path 'test', 'mailbox', u.user.email
    When method get
    * def mail = karate.filter(response.data, function(m) { return m.type == 'password-reset' })[0]
    * match mail.body contains 'expires in 1 hour'
    * def token = mail.link.split('token=')[1]
    Given path 'api', 'v1', 'auth', 'reset-password'
    And request { token: '#(token)', password: 'NewPassword456!' }
    When method post
    Then status 200
    * def login = call read('classpath:common/login.feature') { session: '#(sid)', email: '#(u.user.email)', password: 'NewPassword456!' }
    * match login.status == 200
    Given path 'api', 'v1', 'auth', 'reset-password'
    And request { token: '#(token)', password: 'AnotherPassword789!' }
    When method post
    Then status 400
    And match response.error.code == 'RESET_TOKEN_INVALID'

  @PLS-2.4 @data-driven
  Scenario Outline: PLS-2.4 boundary input: <note>
    # A value like <a*500> means 500 repeats of a (a CSV cell cannot hold that sensibly); UNIQUE8X makes the email new.
    * def expand = function(v) { var m = /^<(.)\*(\d+)>$/.exec(v); return m ? new Array(parseInt(m[2]) + 1).join(m[1]) : v }
    * def sent = { name: '#(expand(name))', email: '#(email.replace("UNIQUE8X", unique()))', password: '#(expand(password))' }
    Given path 'api', 'v1', 'auth', 'register'
    And request sent
    When method post
    Then match responseStatus == parseInt(status)
    * def fields = status == '422' ? karate.jsonPath(response, '$.error.details[*].field') : []
    * def problems = status == '201' ? Schemas.check('UserEnvelope', response) : []
    * match problems == []
    * if (status == '201') karate.match('response.user.email == sent.email.toLowerCase()')
    * if (status == '422') karate.match('fields contains field')

    Examples:
      | read('classpath:data/registration-boundaries.csv') |
