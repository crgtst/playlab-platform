import { API_URL, expect, test } from '../support/fixtures';
import { bearer } from '../support/jwt';
import { cancelAsAdmin, createOrder, createProduct } from '../support/orders';

/**
 * OWASP API3:2023 Broken Object Property Level Authorization: a client must not set a property it should not control
 * (PLS-24.4), and a response must not carry properties it should not show (PLS-24.5).
 */
test.describe('API3 mass assignment', () => {
  const register = (request: import('@playwright/test').APIRequestContext, email: string, role = 'admin') =>
    request.post(`${API_URL}/api/v1/auth/register`, { data: { name: 'Eve Escalate', email, password: 'Password123!', role } });
  const email = () => `escalate-${Date.now()}-${Math.floor(Math.random() * 100000)}@playlab.test`;

  test('PLS-24.4 a registration body that includes "role": "admin" creates a customer account', async ({ request, hooks }) => {
    const admin = await hooks.createUser('admin');
    const address = email();
    const registered = await register(request, address);
    expect(registered.status()).toBe(201);
    expect(((await registered.json()) as { user: { role: string } }).user.role).toBe('customer');

    const listed = await request.get(`${API_URL}/api/v1/admin/users?q=${encodeURIComponent(address)}`, {
      headers: bearer(admin.accessToken),
    });
    expect(((await listed.json()) as { data: { role: string }[] }).data.map((u) => u.role)).toEqual(['customer']);
  });

  test('PLS-24.4 defect mass-assignment-role registers an admin, who can then use the admin routes', async ({ request, hooks }) => {
    await hooks.enableDefects('mass-assignment-role');
    const address = email();
    const registered = await register(request, address);
    expect(registered.status()).toBe(201);
    expect(((await registered.json()) as { user: { role: string } }).user.role).toBe('admin');

    const login = await request.post(`${API_URL}/api/v1/auth/login`, { data: { email: address, password: 'Password123!' } });
    const { accessToken } = (await login.json()) as { accessToken: string };
    expect((await request.get(`${API_URL}/api/v1/admin/users`, { headers: bearer(accessToken) })).status()).toBe(200);
  });
});

test.describe('API3 excessive data exposure', () => {
  async function twoCustomersOrderTheSame(
    hooks: import('../support/hooks').TestHooks,
    request: import('@playwright/test').APIRequestContext,
  ) {
    const [mine, theirs, admin] = [await hooks.createUser(), await hooks.createUser(), await hooks.createUser('admin')];
    // A product only these two buy, so "who else ordered this" has exactly one answer.
    const product = await createProduct(request, admin);
    const first = await createOrder(request, mine, product);
    const second = await createOrder(request, theirs, product);
    return { mine, theirs, admin, first, second };
  }

  test("PLS-24.5 a customer's orders carry no other customer's data, such as their email address", async ({ request, hooks }) => {
    const { mine, theirs, admin, first, second } = await twoCustomersOrderTheSame(hooks, request);
    try {
      const one = await request.get(`${API_URL}/api/v1/orders/${first.id}`, { headers: bearer(mine.accessToken) });
      const list = await request.get(`${API_URL}/api/v1/orders`, { headers: bearer(mine.accessToken) });
      expect(one.status()).toBe(200);
      expect(list.status()).toBe(200);
      const text = JSON.stringify([await one.json(), await list.json()]);
      expect(text).not.toContain(theirs.email);
      expect(text).not.toContain('alsoOrderedBy');
    } finally {
      await cancelAsAdmin(request, admin, first);
      await cancelAsAdmin(request, admin, second);
    }
  });

  test("PLS-24.5 defect excessive-data-exposure adds other buyers' names and emails to a customer's orders", async ({ request, hooks }) => {
    await hooks.enableDefects('excessive-data-exposure');
    const { mine, theirs, admin, first, second } = await twoCustomersOrderTheSame(hooks, request);
    try {
      const one = await request.get(`${API_URL}/api/v1/orders/${first.id}`, { headers: bearer(mine.accessToken) });
      const { data } = (await one.json()) as { data: { alsoOrderedBy: { email: string }[] } };
      expect(data.alsoOrderedBy.map((o) => o.email)).toContain(theirs.email);
    } finally {
      await cancelAsAdmin(request, admin, first);
      await cancelAsAdmin(request, admin, second);
    }
  });
});
