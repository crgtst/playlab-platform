import { API_URL, expect, test } from '../support/fixtures';
import { bearer } from '../support/jwt';

/**
 * OWASP API5:2023 Broken Function Level Authorization: an admin function needs an admin, however it is called. PLS-24.8
 */
test.describe('API5 broken function level authorisation', () => {
  const makeAdmin = (request: import('@playwright/test').APIRequestContext, token: string, id: number) =>
    request.patch(`${API_URL}/api/v1/admin/users/${id}`, { headers: bearer(token), data: { role: 'admin' } });
  const roleOf = async (request: import('@playwright/test').APIRequestContext, adminToken: string, email: string) => {
    const listed = await request.get(`${API_URL}/api/v1/admin/users?q=${encodeURIComponent(email)}`, { headers: bearer(adminToken) });
    return ((await listed.json()) as { data: { role: string }[] }).data.map((u) => u.role);
  };

  test('PLS-24.8 a customer cannot change another user through PATCH /admin/users/{id}', async ({ request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    expect((await makeAdmin(request, customer.accessToken, customer.id)).status()).toBe(403);
    expect((await request.get(`${API_URL}/api/v1/admin/users`, { headers: bearer(customer.accessToken) })).status(), 'the list too').toBe(
      403,
    );
    expect(await roleOf(request, admin.accessToken, customer.email)).toEqual(['customer']);
  });

  test('PLS-24.8 defect bfla-admin-users lets a customer make themselves an admin', async ({ request, hooks, customer }) => {
    await hooks.enableDefects('bfla-admin-users');
    const admin = await hooks.createUser('admin');
    expect((await makeAdmin(request, customer.accessToken, customer.id)).status()).toBe(200);
    expect(await roleOf(request, admin.accessToken, customer.email)).toEqual(['admin']);
  });
});
