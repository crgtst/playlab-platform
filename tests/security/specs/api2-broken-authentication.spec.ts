import { API_URL, expect, test } from '../support/fixtures';
import { bearer, claimsOf, forge } from '../support/jwt';

/**
 * OWASP API2:2023 Broken Authentication: forged and expired tokens (PLS-24.2), and a login or reset form that tells
 * which emails have an account (PLS-24.3).
 */
const AUTH = `${API_URL}/api/v1/auth`;
const me = (request: import('@playwright/test').APIRequestContext, token: string) => request.get(`${AUTH}/me`, { headers: bearer(token) });

test.describe('API2 broken authentication: tokens', () => {
  test('PLS-24.2 an unsigned token, a token signed with another key and an expired token are all refused with 401', async ({
    request,
    hooks,
    customer,
  }) => {
    const claims = claimsOf(customer.accessToken);
    expect((await me(request, customer.accessToken)).status(), 'the real token works').toBe(200);

    expect((await me(request, forge(claims, 'none'))).status(), 'alg: none').toBe(401);
    expect((await me(request, forge(claims, 'HS256', 'not-the-servers-secret'))).status(), 'another key').toBe(401);
    expect((await me(request, customer.accessToken.slice(0, -4) + 'AAAA')).status(), 'tampered signature').toBe(401);

    // An unsigned token that claims to be an admin must not reach an admin route either.
    const admin = await hooks.createUser('admin');
    const forged = forge({ ...claimsOf(admin.accessToken), name: 'Mallory' }, 'none');
    expect((await request.get(`${API_URL}/api/v1/admin/users`, { headers: bearer(forged) })).status(), 'unsigned admin').toBe(401);

    await hooks.advanceClock(16 * 60 * 1000);
    const expired = await me(request, customer.accessToken);
    expect(expired.status(), 'expired').toBe(401);
    expect(((await expired.json()) as { error: { code: string } }).error.code).toBe('TOKEN_EXPIRED');
  });

  test('PLS-24.2 defect jwt-alg-none believes an unsigned token, so a made-up admin can use the admin routes', async ({
    request,
    hooks,
  }) => {
    await hooks.enableDefects('jwt-alg-none');
    const admin = await hooks.createUser('admin');
    const forged = forge({ ...claimsOf(admin.accessToken), name: 'Mallory' }, 'none');
    expect((await request.get(`${API_URL}/api/v1/admin/users`, { headers: bearer(forged) })).status()).toBe(200);
    // Only the missing signature check is the defect: a wrong signature is still refused.
    expect((await me(request, forge(claimsOf(admin.accessToken), 'HS256', 'not-the-servers-secret'))).status()).toBe(401);
  });

  test('PLS-24.2 defect token-never-expires accepts an expired token', async ({ request, hooks, customer }) => {
    await hooks.enableDefects('token-never-expires');
    await hooks.advanceClock(16 * 60 * 1000);
    expect((await me(request, customer.accessToken)).status()).toBe(200);
  });
});

test.describe('API2 broken authentication: account enumeration', () => {
  const failedLogin = async (request: import('@playwright/test').APIRequestContext, email: string) => {
    const response = await request.post(`${AUTH}/login`, { data: { email, password: 'wrong-password' } });
    const { error } = (await response.json()) as { error: { code: string; message: string } };
    return { status: response.status(), code: error.code, message: error.message };
  };
  const reset = async (request: import('@playwright/test').APIRequestContext, email: string) => {
    const response = await request.post(`${AUTH}/forgot-password`, { data: { email } });
    return { status: response.status(), body: await response.json() };
  };
  const unknown = () => `nobody-${Date.now()}-${Math.floor(Math.random() * 1000)}@playlab.test`;

  test('PLS-24.3 a registered and an unknown email get identical responses for a failed login and a password-reset request', async ({
    request,
    customer,
  }) => {
    const other = unknown();
    expect(await failedLogin(request, customer.email)).toEqual(await failedLogin(request, other));
    expect(await reset(request, customer.email)).toEqual(await reset(request, other));
  });

  test('PLS-24.3 defect user-enumeration tells which emails have an account, on login and on password reset', async ({
    request,
    hooks,
    customer,
  }) => {
    await hooks.enableDefects('user-enumeration');
    const known = await failedLogin(request, customer.email);
    const missing = await failedLogin(request, unknown());
    expect([known.status, missing.status]).toEqual([401, 404]);
    expect(known.message).not.toBe(missing.message);
    expect((await reset(request, customer.email)).status).toBe(202);
    expect((await reset(request, unknown())).status).toBe(404);
  });
});
