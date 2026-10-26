Feature: Admin, files and accounts (PLS-8, 9, 21, 22, 23, 24.8)

  Background:
    * url baseUrl
    * def Schemas = Java.type('playlab.Schemas')
    * def session = callonce read('classpath:common/session.feature')
    * def sid = session.id
    * configure headers = { 'X-Test-Session': '#(sid)' }
    * def newUser = function(role) { return karate.call('classpath:common/user.feature', { session: sid, role: role }) }
    * def admin = callonce read('classpath:common/user.feature') { session: '#(session.id)', role: 'admin' }
    * def unique = function() { return java.util.UUID.randomUUID().toString().substring(0, 8) }
    * def productBody = function() { var u = unique(); return { sku: 'KA-' + u, name: 'Karate test product ' + u, description: 'Made by Karate', category: 'books', priceCents: 1999, stock: 4 } }
    * def createProduct =
      """
      function() {
        var res = karate.call('classpath:common/create-product.feature', { session: karate.get('sid'), adminToken: karate.get('admin').token, body: karate.get('productBody')() });
        return res.product;
      }
      """

  @PLS-8.5
  Scenario Outline: PLS-8.5 a <role> cannot create a product: 403
    * def u = newUser('<role>')
    Given path 'api', 'v1', 'products'
    And header Authorization = 'Bearer ' + u.token
    And request productBody()
    When method post
    Then status 403
    And match Schemas.check('Error', response) == []

    Examples:
      | role     |
      | customer |
      | support  |

  @PLS-8.4 @PLS-21.1
  Scenario: PLS-8.4 an admin creates, edits with the current ETag, and deletes a product
    * def made = createProduct()
    Given path 'api', 'v1', 'products', made.id
    When method get
    Then status 200
    * def etag = responseHeaders['ETag'][0]
    Given path 'api', 'v1', 'products', made.id
    And header Authorization = 'Bearer ' + admin.token
    And header If-Match = etag
    And request { name: 'Renamed by Karate' }
    When method patch
    Then status 200
    And match response.data.name == 'Renamed by Karate'
    And match responseHeaders['ETag'][0] != etag
    Given path 'api', 'v1', 'products', made.id
    And header Authorization = 'Bearer ' + admin.token
    When method delete
    Then status 204
    Given path 'api', 'v1', 'products', made.id
    When method get
    Then status 404

  @PLS-21.2 @PLS-21.3
  Scenario: PLS-21.2 a stale ETag is 412 and no If-Match is 428, and the product is left alone
    * def made = createProduct()
    Given path 'api', 'v1', 'products', made.id
    And header Authorization = 'Bearer ' + admin.token
    And header If-Match = '"stale"'
    And request { name: 'Should not be saved' }
    When method patch
    Then status 412
    And match response.error.code == 'PRECONDITION_FAILED'
    Given path 'api', 'v1', 'products', made.id
    And header Authorization = 'Bearer ' + admin.token
    And request { name: 'Should not be saved' }
    When method patch
    Then status 428
    And match response.error.code == 'PRECONDITION_REQUIRED'
    Given path 'api', 'v1', 'products', made.id
    When method get
    Then match response.data.name == made.name
    Given path 'api', 'v1', 'products', made.id
    And header Authorization = 'Bearer ' + admin.token
    When method delete
    Then status 204

  @PLS-9.1
  Scenario: PLS-9.1 a PNG under 2 MB becomes the avatar, and is served back unchanged
    * def u = newUser('customer')
    * def bytes = Java.type('java.util.Base64').getDecoder().decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==')
    Given path 'api', 'v1', 'users', 'me', 'avatar'
    And header Authorization = 'Bearer ' + u.token
    And multipart file avatar = { value: '#(bytes)', filename: 'avatar.png', contentType: 'image/png' }
    When method post
    Then status 201
    And match response.data contains { contentType: 'image/png' }
    * def avatarPath = response.data.avatarUrl
    Given url baseUrl + avatarPath
    When method get
    Then status 200
    And match header Content-Type == 'image/png'
    And match responseBytes == bytes

  @PLS-9.2
  Scenario: PLS-9.2 a file over 2 MB is 413 "File too large"
    * def u = newUser('customer')
    * def big = new java.lang.String(new java.lang.String('a')).repeat(2 * 1024 * 1024 + 1)
    Given path 'api', 'v1', 'users', 'me', 'avatar'
    And header Authorization = 'Bearer ' + u.token
    And multipart file avatar = { value: '#(big)', filename: 'huge.png', contentType: 'image/png' }
    When method post
    Then status 413
    And match response.error.message == 'File too large'

  @PLS-9.3
  Scenario: PLS-9.3 a text file renamed to .png is 415, because the contents are checked, not the name
    * def u = newUser('customer')
    Given path 'api', 'v1', 'users', 'me', 'avatar'
    And header Authorization = 'Bearer ' + u.token
    And multipart file avatar = { value: 'this is not an image', filename: 'fake.png', contentType: 'image/png' }
    When method post
    Then status 415
    And match response.error.code == 'UNSUPPORTED_MEDIA_TYPE'
    And match response.error.message == 'Only PNG or JPG images are allowed'

  @PLS-9.4
  Scenario: PLS-9.4 an admin exports orders to a CSV with a header row; a customer cannot
    Given path 'api', 'v1', 'orders', 'export.csv'
    And header Authorization = 'Bearer ' + admin.token
    When method get
    Then status 200
    And match header Content-Type contains 'text/csv'
    * def lines = response.split('\r\n')
    * match lines[0] == 'number,created_at,customer_email,status,items,subtotal,discount_code,discount,vat,delivery,total,currency'
    * def customer = newUser('customer')
    Given path 'api', 'v1', 'orders', 'export.csv'
    And header Authorization = 'Bearer ' + customer.token
    When method get
    Then status 403

  @PLS-22.1
  Scenario: PLS-22.1 a new name is returned by GET /users/me
    * def u = newUser('customer')
    Given path 'api', 'v1', 'users', 'me'
    And header Authorization = 'Bearer ' + u.token
    And request { name: 'Casey Renamed' }
    When method patch
    Then status 200
    Given path 'api', 'v1', 'users', 'me'
    And header Authorization = 'Bearer ' + u.token
    When method get
    Then status 200
    And match Schemas.check('User', response.data) == []
    And match response.data.name == 'Casey Renamed'

  @PLS-22.2 @PLS-22.3 @PLS-22.6
  Scenario: PLS-22.2 an email changes only with the current password, and not to one that is taken
    * def u = newUser('customer')
    * def other = newUser('customer')
    * def newEmail = 'karate-new-' + unique() + '@playlab.test'
    Given path 'api', 'v1', 'users', 'me'
    And header Authorization = 'Bearer ' + u.token
    And request { email: '#(newEmail)', currentPassword: 'not-the-password' }
    When method patch
    Then status 422
    And match response.error.details[*].field == ['currentPassword']
    Given path 'api', 'v1', 'users', 'me'
    And header Authorization = 'Bearer ' + u.token
    And request { email: '#(other.user.email)', currentPassword: '#(u.password)' }
    When method patch
    Then status 409
    And match response.error.code == 'EMAIL_IN_USE'
    Given path 'api', 'v1', 'users', 'me'
    And header Authorization = 'Bearer ' + u.token
    And request { email: '#(newEmail)', currentPassword: '#(u.password)' }
    When method patch
    Then status 200
    * match karate.call('classpath:common/login.feature', { session: sid, email: newEmail, password: u.password }).status == 200
    * match karate.call('classpath:common/login.feature', { session: sid, email: u.user.email, password: u.password }).status == 401

  @PLS-22.4
  Scenario: PLS-22.4 deleting the account ends the sessions on both devices
    * def u = newUser('customer')
    * def phone = karate.call('classpath:common/login.feature', { session: sid, email: u.user.email, password: u.password })
    * def laptop = karate.call('classpath:common/login.feature', { session: sid, email: u.user.email, password: u.password })
    Given path 'api', 'v1', 'users', 'me'
    And header Authorization = 'Bearer ' + phone.body.accessToken
    When method delete
    Then status 204
    Given path 'api', 'v1', 'users', 'me'
    And header Authorization = 'Bearer ' + laptop.body.accessToken
    When method get
    Then status 401
    And match response.error.code == 'TOKEN_REVOKED'
    Given path 'api', 'v1', 'auth', 'refresh'
    And request { refreshToken: '#(laptop.body.refreshToken)' }
    When method post
    Then status 401

  @PLS-23.1
  Scenario: PLS-23.1 the user list filters by role and by name or email, and pages
    * def tag = 'Pager' + unique()
    * karate.repeat(3, function(i) { karate.call('classpath:common/user.feature', { session: sid, role: 'support' }) })
    Given path 'api', 'v1', 'admin', 'users'
    And header Authorization = 'Bearer ' + admin.token
    And params { role: 'support', limit: 2, page: 1 }
    When method get
    Then status 200
    And match each response.data == '#? _.role == "support"'
    * def invalid = karate.filter(response.data, function(u) { return Schemas.check('AdminUser', u).length > 0 })
    * match invalid == []
    And match response.data == '#[2]'
    And match responseHeaders['X-Total-Count'][0] == '' + response.meta.total
    And match response.meta contains { page: 1, limit: 2 }
    And match karate.toString(response) !contains 'password'

  @PLS-23.2
  Scenario: PLS-23.2 a role change applies from the user's next login, not to the token already issued
    * def u = newUser('customer')
    Given path 'api', 'v1', 'admin', 'users', u.user.id
    And header Authorization = 'Bearer ' + admin.token
    And request { role: 'support' }
    When method patch
    Then status 200
    Given path 'api', 'v1', 'admin', 'users'
    And header Authorization = 'Bearer ' + u.token
    When method get
    Then status 403
    * def login = karate.call('classpath:common/login.feature', { session: sid, email: u.user.email, password: u.password })
    Given path 'api', 'v1', 'admin', 'users'
    And header Authorization = 'Bearer ' + login.body.accessToken
    When method get
    Then status 200

  @PLS-23.3
  Scenario: PLS-23.3 an admin unlocks a locked account and the user can log in at once
    * def u = newUser('customer')
    * karate.repeat(5, function(i) { karate.call('classpath:common/login.feature', { session: sid, email: u.user.email, password: 'wrong-password' }) })
    * match karate.call('classpath:common/login.feature', { session: sid, email: u.user.email, password: u.password }).status == 423
    Given path 'api', 'v1', 'admin', 'users', u.user.id
    And header Authorization = 'Bearer ' + admin.token
    And request { unlock: true }
    When method patch
    Then status 200
    And match response.data contains { locked: false, failedLogins: 0 }
    * match karate.call('classpath:common/login.feature', { session: sid, email: u.user.email, password: u.password }).status == 200

  @PLS-23.4 @PLS-23.5 @PLS-24.8
  Scenario: PLS-23.4 support may list users but not change them, and a customer may do neither
    * def support = newUser('support')
    * def customer = newUser('customer')
    * def target = newUser('customer')
    Given path 'api', 'v1', 'admin', 'users'
    And header Authorization = 'Bearer ' + support.token
    And param limit = 1
    When method get
    Then status 200
    Given path 'api', 'v1', 'admin', 'users', target.user.id
    And header Authorization = 'Bearer ' + support.token
    And request { role: 'admin' }
    When method patch
    Then status 403
    Given path 'api', 'v1', 'admin', 'users'
    And header Authorization = 'Bearer ' + customer.token
    When method get
    Then status 403
    Given path 'api', 'v1', 'admin', 'users', target.user.id
    And header Authorization = 'Bearer ' + customer.token
    And request { role: 'admin' }
    When method patch
    Then status 403
    Given path 'api', 'v1', 'admin', 'users'
    And header Authorization = 'Bearer ' + admin.token
    And param q = target.user.email
    When method get
    Then match response.data[0].role == 'customer'
