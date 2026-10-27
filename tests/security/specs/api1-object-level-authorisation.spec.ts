import { API_URL, expect, test } from '../support/fixtures';
import { productId } from '../support/data';
import { bearer } from '../support/jwt';
import { cancelAsAdmin, createOrder } from '../support/orders';

/**
 * OWASP API1:2023 Broken Object Level Authorization. An id in the URL must not be enough to reach someone else's object.
 * PLS-24.1
 */
test.describe('API1 broken object level authorisation', () => {
  async function victimOrder(hooks: import('../support/hooks').TestHooks, request: import('@playwright/test').APIRequestContext) {
    const [owner, attacker, admin] = [await hooks.createUser(), await hooks.createUser(), await hooks.createUser('admin')];
    return { attacker, admin, order: await createOrder(request, owner, productId('BK-002')) };
  }

  test("PLS-24.1 customer A cannot read, track or cancel customer B's order: 404", async ({ request, hooks }) => {
    const { attacker, admin, order } = await victimOrder(hooks, request);
    try {
      for (const call of [
        () => request.get(`${API_URL}/api/v1/orders/${order.id}`, { headers: bearer(attacker.accessToken) }),
        () => request.get(`${API_URL}/api/v1/orders/${order.id}/tracking`, { headers: bearer(attacker.accessToken) }),
        () => request.post(`${API_URL}/api/v1/orders/${order.id}/cancel`, { headers: bearer(attacker.accessToken) }),
      ]) {
        expect((await call()).status()).toBe(404);
      }
      const after = await request.get(`${API_URL}/api/v1/orders/${order.id}`, { headers: bearer(admin.accessToken) });
      expect(((await after.json()) as { data: { status: string } }).data.status, 'the order is untouched').toBe('paid');
    } finally {
      await cancelAsAdmin(request, admin, order);
    }
  });

  test("PLS-24.1 defect order-leak lets customer A read, track and cancel customer B's order", async ({ request, hooks }) => {
    await hooks.enableDefects('order-leak');
    const { attacker, admin, order } = await victimOrder(hooks, request);
    try {
      expect((await request.get(`${API_URL}/api/v1/orders/${order.id}`, { headers: bearer(attacker.accessToken) })).status()).toBe(200);
      expect((await request.get(`${API_URL}/api/v1/orders/${order.id}/tracking`, { headers: bearer(attacker.accessToken) })).status()).toBe(
        200,
      );
      expect((await request.post(`${API_URL}/api/v1/orders/${order.id}/cancel`, { headers: bearer(attacker.accessToken) })).status()).toBe(
        200,
      );
    } finally {
      await cancelAsAdmin(request, admin, order);
    }
  });
});
