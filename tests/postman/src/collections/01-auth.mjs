import { collection, folder, request } from '../dsl.mjs';

const loginAs = (key, password) => `
  const u = await PL.user('${key}');
  pm.environment.set('loginBody', JSON.stringify({ email: u.email, password: ${password ?? 'u.password'} }));`;

const failedLogin = (n) =>
  request({
    name: `Failed login ${n} of 5`,
    method: 'POST',
    path: '/api/v1/auth/login',
    body: '{{loginBody}}',
    pre: loginAs('customer:lockout', "'wrong-password'"),
    test: `PL.status('PLS-1.3', 401, 'failed attempt ${n} is refused with 401');`,
  });

export default collection('01 Auth: login, session, lockout', 'PLS-1 over the API: logging in, failing, locking out, refreshing, logging out and expiry.', [
  folder('Login and session', [
    request({
      name: 'Log in with valid credentials',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: '{{loginBody}}',
      pre: loginAs('customer'),
      test: `
        PL.status('PLS-1.1', 200, 'valid credentials return 200');
        PL.schema('PLS-1.1', 'Session');
        PL.ac('PLS-1.1', 'the user in the session is the customer who logged in', () => {
          const u = PL.get('user.customer');
          pm.expect(PL.json().user.email).to.eql(u.email);
          pm.expect(PL.json().tokenType).to.eql('Bearer');
        });
        PL.set('session.customer', { refreshToken: PL.json().refreshToken });`,
    }),
    request({
      name: 'Log in with a wrong password',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: '{{loginBody}}',
      pre: loginAs('customer', "'wrong-password'"),
      test: `
        PL.status('PLS-1.2', 401, 'a wrong password returns 401');
        PL.schema('PLS-1.2', 'Error');
        PL.ac('PLS-1.2', 'the message is "Email or password is incorrect" and no cookie is set', () => {
          pm.expect(PL.json().error.message).to.eql('Email or password is incorrect');
          pm.expect(pm.response.headers.get('Set-Cookie')).to.be.oneOf([undefined, null]);
        });`,
    }),
    request({
      name: 'Read the current user with the access token',
      path: '/api/v1/auth/me',
      as: 'customer',
      test: `
        PL.status('PLS-1.1', 200, 'GET /auth/me with a valid token returns 200');
        PL.schema('PLS-1.1', 'UserEnvelope');`,
    }),
    request({
      name: 'Refresh the access token',
      method: 'POST',
      path: '/api/v1/auth/refresh',
      body: '{"refreshToken": "{{refreshToken}}"}',
      pre: `pm.environment.set('refreshToken', PL.get('session.customer').refreshToken);`,
      test: `
        PL.status('PLS-1.6', 200, 'a valid refresh token returns 200');
        PL.schema('PLS-1.6', 'Session');
        PL.ac('PLS-1.6', 'a new access token is returned', () => pm.expect(PL.json().accessToken).to.be.a('string').and.not.empty);`,
    }),
    request({
      name: 'Log out',
      method: 'POST',
      path: '/api/v1/auth/logout',
      body: '{"refreshToken": "{{refreshToken}}"}',
      pre: `
        const login = await PL.call('POST', '/api/v1/auth/login', { body: { email: (await PL.user('customer:logout')).email, password: (await PL.user('customer:logout')).password } });
        pm.environment.set('refreshToken', login.json().refreshToken);`,
      test: `PL.status('PLS-1.4', 204, 'logging out returns 204');`,
    }),
    request({
      name: 'The refresh token no longer works after logout',
      method: 'POST',
      path: '/api/v1/auth/refresh',
      body: '{"refreshToken": "{{refreshToken}}"}',
      test: `
        PL.status('PLS-1.4', 401, 'a refresh token revoked by logout is refused with 401');
        PL.schema('PLS-1.4', 'Error');`,
    }),
  ]),
  folder('Lockout (PLS-1.3)', [
    ...[1, 2, 3, 4, 5].map(failedLogin),
    request({
      name: 'The sixth attempt is locked out',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: '{{loginBody}}',
      pre: loginAs('customer:lockout'),
      test: `
        PL.status('PLS-1.3', 423, 'the sixth attempt returns 423 even with the right password');
        PL.errorCode('PLS-1.3', 'ACCOUNT_LOCKED');
        PL.ac('PLS-1.3', 'Retry-After says how long the lock lasts', () => pm.expect(Number(pm.response.headers.get('Retry-After'))).to.be.within(1, 15 * 60));`,
    }),
  ]),
  // Last, because it moves the session's clock forward.
  folder('Token expiry (PLS-1.5)', [
    request({
      name: 'An access token older than 15 minutes is refused',
      path: '/api/v1/auth/me',
      as: 'customer:expiry',
      pre: `await PL.call('POST', '/test/clock', { body: { advanceMs: 16 * 60 * 1000 } });`,
      test: `
        PL.status('PLS-1.5', 401, 'an expired access token returns 401');
        PL.errorCode('PLS-1.5', 'TOKEN_EXPIRED');`,
    }),
  ]),
]);
