import { API_URL, expect, test } from '../support/fixtures';
import { productId } from '../support/data';
import { cancelAsAdmin, createOrder } from '../support/orders';

/**
 * OWASP API9:2023 Improper Inventory Management: a retired API version must be gone, not left running without the
 * protections of the current one. PLS-24.13
 */
test.describe('API9 improper inventory management', () => {
  test('PLS-24.13 the retired /api/v0/orders route returns 404', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v0/orders`);
    expect(res.status()).toBe(404);
    expect((await request.get(`${API_URL}/api/v0/users`)).status()).toBe(404);
  });

  test("PLS-24.13 defect shadow-api-v0 brings back /api/v0/orders, which lists every order and its customer's email to anyone, with no login", async ({
    request,
    hooks,
  }) => {
    await hooks.enableDefects('shadow-api-v0');
    const [customer, admin] = [await hooks.createUser(), await hooks.createUser('admin')];
    const order = await createOrder(request, customer, productId('BK-001'));
    try {
      // No Authorization header at all.
      const res = await request.get(`${API_URL}/api/v0/orders`);
      expect(res.status()).toBe(200);
      const { orders } = (await res.json()) as { orders: { number: string; customerEmail: string }[] };
      expect(orders.find((o) => o.number === order.number)?.customerEmail).toBe(customer.email);
    } finally {
      await cancelAsAdmin(request, admin, order);
    }
  });
});
