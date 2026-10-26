import { Header } from '../../pages/Header';
import { LoginPage } from '../../pages/LoginPage';
import { API_URL, expect, test } from '../../support/fixtures';
import { cancelOrder, createOrder } from '../../support/orders';

const AUTH_URL = `${API_URL}/api/v1/auth`;
const ME_URL = `${API_URL}/api/v1/users/me`;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function logIn(request: import('@playwright/test').APIRequestContext, user: { email: string; password: string }): Promise<Tokens> {
  const response = await request.post(`${AUTH_URL}/login`, { data: { email: user.email, password: user.password } });
  expect(response.status(), `Log in as ${user.email}`).toBe(200);
  return (await response.json()) as Tokens;
}

test.describe('PLS-22 Account management', () => {
  test('PLS-22.1 a new name is returned by GET /users/me and shown in the header', async ({ page, request, customer }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.logIn(customer);

    const renamed = await request.patch(ME_URL, { headers: bearer(customer.accessToken), data: { name: 'Casey Renamed' } });
    expect(renamed.status()).toBe(200);
    const me = await request.get(ME_URL, { headers: bearer(customer.accessToken) });
    expect(((await me.json()) as { data: { name: string } }).data.name).toBe('Casey Renamed');

    await page.reload();
    await expect(new Header(page).userName).toHaveText('Casey Renamed');
  });

  test('PLS-22.2 after changing email with the current password, the new email logs in and the old one does not', async ({
    request,
    customer,
  }) => {
    const newEmail = `renamed-${customer.email}`;
    const changed = await request.patch(ME_URL, {
      headers: bearer(customer.accessToken),
      data: { email: newEmail, currentPassword: customer.password },
    });
    expect(changed.status()).toBe(200);
    expect(((await changed.json()) as { data: { email: string } }).data.email).toBe(newEmail);

    await logIn(request, { email: newEmail, password: customer.password });
    const old = await request.post(`${AUTH_URL}/login`, { data: { email: customer.email, password: customer.password } });
    expect(old.status()).toBe(401);
  });

  test('PLS-22.3 a wrong current password is refused with 422 on currentPassword and the email is unchanged', async ({
    request,
    customer,
  }) => {
    const refused = await request.patch(ME_URL, {
      headers: bearer(customer.accessToken),
      data: { email: `other-${customer.email}`, currentPassword: 'not-the-password' },
    });
    expect(refused.status()).toBe(422);
    const body = (await refused.json()) as { error: { details: { field: string }[] } };
    expect(body.error.details.map((d) => d.field)).toEqual(['currentPassword']);

    const me = await request.get(ME_URL, { headers: bearer(customer.accessToken) });
    expect(((await me.json()) as { data: { email: string } }).data.email).toBe(customer.email);
  });

  test('PLS-22.4 deleting the account ends sessions on both devices', async ({ request, customer }) => {
    const phone = await logIn(request, customer);
    const laptop = await logIn(request, customer);

    const deleted = await request.delete(ME_URL, { headers: bearer(phone.accessToken) });
    expect(deleted.status()).toBe(204);

    for (const device of [phone, laptop]) {
      const me = await request.get(ME_URL, { headers: bearer(device.accessToken) });
      expect(me.status()).toBe(401);
      const refreshed = await request.post(`${AUTH_URL}/refresh`, { data: { refreshToken: device.refreshToken } });
      expect(refreshed.status()).toBe(401);
    }
  });

  test("PLS-22.5 a deleted account's orders are kept with the name and email anonymised", async ({ request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, 'BK-001');
    try {
      expect((await request.delete(ME_URL, { headers: bearer(customer.accessToken) })).status()).toBe(204);

      const seen = await request.get(`${API_URL}/api/v1/orders/${order.id}`, { headers: bearer(admin.accessToken) });
      expect(seen.status()).toBe(200);
      const body = (await seen.json()) as { data: { number: string; customer: { name: string; email: string } } };
      expect(body.data.number).toBe(order.number);
      expect(body.data.customer.name).toBe('Deleted user');
      expect(body.data.customer.email).toMatch(/^deleted-\d+@playlab\.invalid$/);
      expect(JSON.stringify(body)).not.toContain(customer.email);
    } finally {
      await cancelOrder(request, admin, order);
    }
  });

  test('PLS-22.6 an email that belongs to another account is refused with 409 EMAIL_IN_USE and the email is unchanged', async ({
    request,
    hooks,
    customer,
  }) => {
    const other = await hooks.createUser('customer');
    const refused = await request.patch(ME_URL, {
      headers: bearer(customer.accessToken),
      data: { email: other.email, currentPassword: customer.password },
    });
    expect(refused.status()).toBe(409);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('EMAIL_IN_USE');

    const me = await request.get(ME_URL, { headers: bearer(customer.accessToken) });
    expect(((await me.json()) as { data: { email: string } }).data.email).toBe(customer.email);
  });
});
