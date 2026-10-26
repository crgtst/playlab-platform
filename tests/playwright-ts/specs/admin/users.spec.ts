import { API_URL, expect, test } from '../../support/fixtures';
import type { APIRequestContext } from '@playwright/test';
import type { TestUser } from '../../support/hooks';

const AUTH_URL = `${API_URL}/api/v1/auth`;
const USERS_URL = `${API_URL}/api/v1/admin/users`;
const bearer = (user: Pick<TestUser, 'accessToken'>) => ({ Authorization: `Bearer ${user.accessToken}` });

interface ListedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  locked: boolean;
  failedLogins: number;
}

async function listUsers(request: APIRequestContext, admin: TestUser, query: string) {
  const response = await request.get(`${USERS_URL}?${query}`, { headers: bearer(admin) });
  expect(response.status(), `List users with ${query}`).toBe(200);
  return {
    response,
    ...((await response.json()) as { data: ListedUser[]; meta: { page: number; limit: number; total: number; totalPages: number } }),
  };
}

const login = (request: APIRequestContext, user: { email: string; password: string }) =>
  request.post(`${AUTH_URL}/login`, { data: { email: user.email, password: user.password } });

test.describe('PLS-23 User administration', () => {
  test('PLS-23.1 the user list filters by role and by name or email, and pages', async ({ request, hooks }) => {
    const admin = await hooks.createUser('admin');
    // A name only this test uses, so other tests' accounts never appear in the results.
    const tag = `Pager${Date.now()}${Math.floor(Math.random() * 1000)}`;
    for (const suffix of ['One', 'Two', 'Three']) await hooks.createUser('support', `${tag} ${suffix}`);
    await hooks.createUser('customer', `${tag} Customer`);

    const support = await listUsers(request, admin, `role=support&q=${tag}`);
    expect(support.data.map((u) => u.role)).toEqual(['support', 'support', 'support']);
    expect(support.meta).toMatchObject({ page: 1, total: 3, totalPages: 1 });

    const everyone = await listUsers(request, admin, `q=${tag}&limit=3&page=2`);
    expect(everyone.meta).toEqual({ page: 2, limit: 3, total: 4, totalPages: 2 });
    expect(everyone.data).toHaveLength(1);
    expect(everyone.response.headers()['x-total-count']).toBe('4');

    const byEmail = await listUsers(request, admin, `q=${encodeURIComponent(support.data[0].email)}`);
    expect(byEmail.data.map((u) => u.email)).toEqual([support.data[0].email]);
    expect(JSON.stringify(support)).not.toMatch(/password|\$2[aby]\$/i);
  });

  test("PLS-23.2 a role change applies from the user's next login", async ({ request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const before = await login(request, customer);
    const { accessToken: oldToken } = (await before.json()) as { accessToken: string };

    const changed = await request.patch(`${USERS_URL}/${customer.id}`, { headers: bearer(admin), data: { role: 'support' } });
    expect(changed.status()).toBe(200);
    expect(((await changed.json()) as { data: { role: string } }).data.role).toBe('support');

    // The token already issued keeps the old role; a new login gets the new one.
    expect((await request.get(USERS_URL, { headers: bearer({ accessToken: oldToken }) })).status()).toBe(403);
    const after = await login(request, customer);
    const { accessToken: newToken } = (await after.json()) as { accessToken: string };
    expect((await request.get(USERS_URL, { headers: bearer({ accessToken: newToken }) })).status()).toBe(200);
  });

  test('PLS-23.3 an admin unlocks an account locked by failed logins and the user can log in at once', async ({
    request,
    hooks,
    customer,
  }) => {
    const admin = await hooks.createUser('admin');
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await login(request, { email: customer.email, password: 'wrong-password' })).status()).toBe(401);
    }
    expect((await login(request, customer)).status()).toBe(423);
    const locked = await listUsers(request, admin, `q=${encodeURIComponent(customer.email)}`);
    expect(locked.data[0]).toMatchObject({ email: customer.email, locked: true });

    const unlocked = await request.patch(`${USERS_URL}/${customer.id}`, { headers: bearer(admin), data: { unlock: true } });
    expect(unlocked.status()).toBe(200);
    expect(((await unlocked.json()) as { data: ListedUser }).data).toMatchObject({ locked: false, failedLogins: 0 });
    expect((await login(request, customer)).status()).toBe(200);
  });

  test('PLS-23.4 support can list users but cannot change one', async ({ request, hooks, customer }) => {
    const support = await hooks.createUser('support');
    expect((await request.get(`${USERS_URL}?q=${encodeURIComponent(customer.email)}`, { headers: bearer(support) })).status()).toBe(200);

    const refused = await request.patch(`${USERS_URL}/${customer.id}`, { headers: bearer(support), data: { role: 'admin' } });
    expect(refused.status()).toBe(403);
  });

  test('PLS-23.5 a customer cannot list users', async ({ request, customer }) => {
    const refused = await request.get(USERS_URL, { headers: bearer(customer) });
    expect(refused.status()).toBe(403);
  });
});
