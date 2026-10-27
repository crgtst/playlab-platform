@ignore
Feature: A throwaway user (POST /test/users)

  Call with { session, role }. Returns user, password, token and the headers to send as that user.

  Scenario:
    * configure headers = null
    Given url baseUrl
    And path 'test', 'users'
    And header X-Test-Session = session
    And request { role: '#(role)' }
    When method post
    Then status 201
    * def user = response.user
    * def password = response.password
    * def token = response.accessToken
    * def auth = { 'X-Test-Session': '#(session)', Authorization: '#("Bearer " + token)' }
