import { API_URL, expect, test } from '../../support/fixtures';
import { product } from '../../support/data';
import { cancelOrder, createOrder, getOrder, tryOrderStatus } from '../../support/orders';
import { getProduct, restoreStock } from '../../support/products';
import type { APIRequestContext } from '@playwright/test';
import type { TestOrder } from '../../support/orders';
import type { TestUser } from '../../support/hooks';

const ordersUrl = `${API_URL}/api/v1/orders`;
// Only this file orders these two products. Shipped and delivered orders cannot be cancelled, so they use up ORDER_SKU's
// stock for good; afterAll puts it back. STOCK_SKU is only ever ordered and cancelled inside one test.
const ORDER_SKU = 'HK-005';
const STOCK_SKU = 'HK-008';

test.afterAll(async () => {
  await restoreStock(ORDER_SKU);
});

async function setBug(request: APIRequestContext, bug: string) {
  const response = await request.post(`${API_URL}/test/bugs`, { data: { enable: [bug] } });
  expect(response.status(), `Enable ${bug} defect mode`).toBe(200);
}

/** Moves a fresh order (which starts `paid`) forward, one allowed step at a time. */
async function advance(request: APIRequestContext, admin: TestUser, order: TestOrder, to: 'processing' | 'shipped' | 'delivered') {
  const path = ['processing', 'shipped', 'delivered'];
  for (const status of path.slice(0, path.indexOf(to) + 1)) {
    const response = await tryOrderStatus(request, admin, order.id, status);
    expect(response.status(), `Move ${order.number} to ${status}`).toBe(200);
  }
}

// An order placed through the API is paid straight away, and no API call makes a `pending` one, so the first step of
// PLS-20.1 (pending → paid) cannot be set up from outside; it is covered by the platform integration tests.
test.describe('PLS-20 Order lifecycle', () => {
  test('PLS-20.1 an admin moves an order one step at a time and each step returns the new status', async ({ request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, ORDER_SKU);
    for (const status of ['processing', 'shipped', 'delivered']) {
      const response = await tryOrderStatus(request, admin, order.id, status);
      expect(response.status()).toBe(200);
      expect(((await response.json()) as { data: { status: string } }).data.status).toBe(status);
    }
  });

  test('PLS-20.2 a delivered order cannot go back to pending: 409 with from, to and allowed', async ({ request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, ORDER_SKU);
    await advance(request, admin, order, 'delivered');

    const response = await tryOrderStatus(request, admin, order.id, 'pending');
    expect(response.status()).toBe(409);
    const body = (await response.json()) as { error: { code: string; details: unknown } };
    expect(body.error.code).toBe('INVALID_TRANSITION');
    expect(body.error.details).toEqual({ from: 'delivered', to: 'pending', allowed: [] });
    expect((await getOrder(request, admin, order.id)).order.status).toBe('delivered');
  });

  test('PLS-20.2 defect status-any-transition lets a delivered order go back to pending', async ({ request, hooks, customer }) => {
    await setBug(request, 'status-any-transition');
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, ORDER_SKU);
    await advance(request, admin, order, 'delivered');

    const response = await tryOrderStatus(request, admin, order.id, 'pending');
    expect(response.status()).toBe(200);
    expect((await getOrder(request, admin, order.id)).order.status).toBe('pending');
  });

  test('PLS-20.3 a shipped order cannot be cancelled', async ({ request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, ORDER_SKU);
    await advance(request, admin, order, 'shipped');

    const response = await tryOrderStatus(request, admin, order.id, 'cancelled');
    expect(response.status()).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('INVALID_TRANSITION');
    expect((await getOrder(request, admin, order.id)).order.status).toBe('shipped');
  });

  test('PLS-20.3 defect status-any-transition lets a shipped order be cancelled', async ({ request, hooks, customer }) => {
    await setBug(request, 'status-any-transition');
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, ORDER_SKU);
    await advance(request, admin, order, 'shipped');

    expect((await tryOrderStatus(request, admin, order.id, 'cancelled')).status()).toBe(200);
  });

  test("PLS-20.4 a bulk change where some orders can't move changes none and lists every order that can't", async ({
    request,
    hooks,
    customer,
  }) => {
    const admin = await hooks.createUser('admin');
    const movable = await createOrder(request, customer, ORDER_SKU);
    const shipped = await createOrder(request, customer, ORDER_SKU);
    const delivered = await createOrder(request, customer, ORDER_SKU);
    await advance(request, admin, shipped, 'shipped');
    await advance(request, admin, delivered, 'delivered');

    const response = await request.post(`${ordersUrl}/bulk-status`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: { ids: [movable.id, shipped.id, delivered.id], status: 'processing' },
    });
    expect(response.status()).toBe(409);
    const body = (await response.json()) as { error: { code: string; details: { orders: { id: number; from: string }[] } } };
    expect(body.error.code).toBe('INVALID_TRANSITION');
    expect(body.error.details.orders.map((o) => [o.id, o.from]).sort()).toEqual(
      [
        [shipped.id, 'shipped'],
        [delivered.id, 'delivered'],
      ].sort(),
    );
    // Nothing changed, not even the order that could have moved.
    expect((await getOrder(request, admin, movable.id)).order.status).toBe('paid');
    expect((await getOrder(request, admin, shipped.id)).order.status).toBe('shipped');
    expect((await getOrder(request, admin, delivered.id)).order.status).toBe('delivered');

    await cancelOrder(request, admin, movable);
  });

  test('PLS-20.4 defect status-any-transition lets a bulk change through for orders that cannot move', async ({
    request,
    hooks,
    customer,
  }) => {
    await setBug(request, 'status-any-transition');
    const admin = await hooks.createUser('admin');
    const movable = await createOrder(request, customer, ORDER_SKU);
    const delivered = await createOrder(request, customer, ORDER_SKU);
    await advance(request, admin, delivered, 'delivered');

    const response = await request.post(`${ordersUrl}/bulk-status`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: { ids: [movable.id, delivered.id], status: 'processing' },
    });
    expect(response.status()).toBe(200);
    expect((await getOrder(request, admin, delivered.id)).order.status).toBe('processing');
  });

  test("PLS-20.5 cancelling a processing order puts each item's stock back", async ({ request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const stockId = product(STOCK_SKU).id;
    const before = (await getProduct(request, stockId)).product.stock;
    const order = await createOrder(request, customer, STOCK_SKU);
    expect((await getProduct(request, stockId)).product.stock).toBe(before - 1);
    await advance(request, admin, order, 'processing');

    expect((await tryOrderStatus(request, admin, order.id, 'cancelled')).status()).toBe(200);
    expect((await getOrder(request, admin, order.id)).order.status).toBe('cancelled');
    expect((await getProduct(request, stockId)).product.stock).toBe(before);
  });

  test('PLS-20.6 a customer can cancel their own paid order, but not one that is processing', async ({ request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const paid = await createOrder(request, customer, ORDER_SKU);
    const processing = await createOrder(request, customer, ORDER_SKU);
    await advance(request, admin, processing, 'processing');
    const headers = { Authorization: `Bearer ${customer.accessToken}` };

    const cancelled = await request.post(`${ordersUrl}/${paid.id}/cancel`, { headers });
    expect(cancelled.status()).toBe(200);
    expect(((await cancelled.json()) as { data: { status: string } }).data.status).toBe('cancelled');

    const refused = await request.post(`${ordersUrl}/${processing.id}/cancel`, { headers });
    expect(refused.status()).toBe(409);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('INVALID_TRANSITION');
    expect((await getOrder(request, admin, processing.id)).order.status).toBe('processing');

    await cancelOrder(request, admin, processing);
  });
});
