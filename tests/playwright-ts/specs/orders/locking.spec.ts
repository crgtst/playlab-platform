import { AdminPage } from '../../pages/AdminPage';
import { product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';
import { cancelOrder, createOrder, getOrder, tryOrderStatus } from '../../support/orders';
import { createProduct, deleteProduct, getProduct, restoreStock, updateProduct } from '../../support/products';
import type { APIRequestContext } from '@playwright/test';
import type { TestUser } from '../../support/hooks';

const productsUrl = `${API_URL}/api/v1/products`;
const ordersUrl = `${API_URL}/api/v1/orders`;
// Only this file orders this product. Orders are cancelled, which puts the stock back; afterAll covers the defect tests that can't.
const ORDER_SKU = 'HK-006';
// The race product: its stock is set to 1 for the race and put back to its seeded level afterwards. Only this file orders it.
const RACE_SKU = 'SP-004';

test.afterAll(async () => {
  await restoreStock(ORDER_SKU);
});

async function setBug(request: APIRequestContext, bug: string) {
  const response = await request.post(`${API_URL}/test/bugs`, { data: { enable: [bug] } });
  expect(response.status(), `Enable ${bug} defect mode`).toBe(200);
}

test.describe('PLS-21 Concurrency and lost updates', () => {
  // The AC names product 6, which other suites read; these use a product created for the test, which behaves the same.
  test('PLS-21.1 an edit with the current ETag returns 200 and a new ETag', async ({ request, hooks }) => {
    const admin = await hooks.createUser('admin');
    const created = await createProduct(request, admin);
    try {
      const { etag } = await getProduct(request, created.id);
      const response = await updateProduct(request, admin, created.id, etag, { name: 'Edited with the current ETag' });
      expect(response.status()).toBe(200);
      expect(response.headers()['etag']).toBeTruthy();
      expect(response.headers()['etag']).not.toBe(etag);
      expect(response.headers()['etag']).toBe((await getProduct(request, created.id)).etag);
    } finally {
      await deleteProduct(request, admin, created.id);
    }
  });

  test("PLS-21.2 a stale ETag returns 412 and leaves the other admin's edit in place", async ({ request, hooks }) => {
    const admin = await hooks.createUser('admin');
    const created = await createProduct(request, admin);
    try {
      const { etag: stale } = await getProduct(request, created.id);
      expect((await updateProduct(request, admin, created.id, stale, { name: 'First admin wins' })).status()).toBe(200);

      const refused = await updateProduct(request, admin, created.id, stale, { name: 'Second admin loses' });
      expect(refused.status()).toBe(412);
      expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('PRECONDITION_FAILED');
      expect((await getProduct(request, created.id)).product.name).toBe('First admin wins');
    } finally {
      await deleteProduct(request, admin, created.id);
    }
  });

  test('PLS-21.2 defect lost-update lets a stale edit overwrite the other admin', async ({ request, hooks }) => {
    await setBug(request, 'lost-update');
    const admin = await hooks.createUser('admin');
    const created = await createProduct(request, admin);
    try {
      const { etag: stale } = await getProduct(request, created.id);
      await updateProduct(request, admin, created.id, stale, { name: 'First admin' });

      const overwritten = await updateProduct(request, admin, created.id, stale, { name: 'Second admin overwrites' });
      expect(overwritten.status()).toBe(200);
      expect((await getProduct(request, created.id)).product.name).toBe('Second admin overwrites');
    } finally {
      await deleteProduct(request, admin, created.id);
    }
  });

  test('PLS-21.3 PUT without If-Match returns 428', async ({ request, hooks }) => {
    const admin = await hooks.createUser('admin');
    const created = await createProduct(request, admin);
    try {
      const { product: current } = await getProduct(request, created.id);
      const response = await request.put(`${productsUrl}/${created.id}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        data: {
          sku: current.sku,
          name: current.name,
          description: 'No precondition',
          category: 'books',
          priceCents: current.priceCents,
          stock: current.stock,
        },
      });
      expect(response.status()).toBe(428);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('PRECONDITION_REQUIRED');
    } finally {
      await deleteProduct(request, admin, created.id);
    }
  });

  test('PLS-21.3 defect lost-update accepts a PUT with no If-Match', async ({ request, hooks }) => {
    await setBug(request, 'lost-update');
    const admin = await hooks.createUser('admin');
    const created = await createProduct(request, admin);
    try {
      const { product: current } = await getProduct(request, created.id);
      const response = await request.put(`${productsUrl}/${created.id}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        data: {
          sku: current.sku,
          name: current.name,
          description: 'No precondition',
          category: 'books',
          priceCents: current.priceCents,
          stock: current.stock,
        },
      });
      expect(response.status()).toBe(200);
    } finally {
      await deleteProduct(request, admin, created.id);
    }
  });

  test('PLS-21.5 an order status change with a stale If-Match returns 412, and without one returns 428', async ({
    request,
    hooks,
    customer,
  }) => {
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, ORDER_SKU);
    try {
      const { etag: stale } = await getOrder(request, admin, order.id);
      expect((await tryOrderStatus(request, admin, order.id, 'processing')).status()).toBe(200);

      const patch = (headers: Record<string, string>) =>
        request.patch(`${ordersUrl}/${order.id}/status`, {
          headers: { Authorization: `Bearer ${admin.accessToken}`, ...headers },
          data: { status: 'shipped' },
        });
      const staleResponse = await patch({ 'If-Match': stale });
      expect(staleResponse.status()).toBe(412);
      expect(((await staleResponse.json()) as { error: { code: string } }).error.code).toBe('PRECONDITION_FAILED');
      expect((await getOrder(request, admin, order.id)).order.status).toBe('processing');

      expect((await patch({})).status()).toBe(428);
      expect((await getOrder(request, admin, order.id)).order.status).toBe('processing');
    } finally {
      await cancelOrder(request, admin, order);
    }
  });

  test('PLS-21.5 defect lost-update accepts a stale or missing If-Match on an order', async ({ request, hooks, customer }) => {
    await setBug(request, 'lost-update');
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, ORDER_SKU);
    try {
      const { etag: stale } = await getOrder(request, admin, order.id);
      await tryOrderStatus(request, admin, order.id, 'processing');

      const stalePatch = await request.patch(`${ordersUrl}/${order.id}/status`, {
        headers: { Authorization: `Bearer ${admin.accessToken}`, 'If-Match': stale },
        data: { status: 'shipped' },
      });
      expect(stalePatch.status()).toBe(200);
    } finally {
      await cancelOrder(request, admin, order).catch(() => undefined);
    }
  });

  test("PLS-21.6 an order has an ETag, and it changes when the order's status changes", async ({ request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, ORDER_SKU);
    try {
      const before = await getOrder(request, customer, order.id);
      expect(before.etag).toBeTruthy();
      expect(await getOrder(request, customer, order.id)).toMatchObject({ etag: before.etag });

      expect((await tryOrderStatus(request, admin, order.id, 'processing')).status()).toBe(200);
      const after = await getOrder(request, customer, order.id);
      expect(after.order.status).toBe('processing');
      expect(after.etag).toBeTruthy();
      expect(after.etag).not.toBe(before.etag);
    } finally {
      await cancelOrder(request, admin, order);
    }
  });

  test.describe('PLS-21.7 the admin orders grid', () => {
    const changedElsewhere = (number: string) => `Order ${number} was changed by someone else. It now shows its current status.`;

    async function staleGrid(
      browser: import('@playwright/test').Browser,
      page: import('@playwright/test').Page,
      testSession: string,
      request: APIRequestContext,
      hooks: import('../../support/hooks').TestHooks,
      customer: TestUser,
    ) {
      const first = await hooks.createUser('admin');
      const second = await hooks.createUser('admin');
      const order = await createOrder(request, customer, ORDER_SKU);

      // The first admin's grid is open on the order.
      const grid = new AdminPage(page);
      await grid.logIn(first.email, first.password);
      await grid.openOrders();
      await grid.searchOrders(order.number);
      const row = grid.orderRow(order.id);
      await expect(row).toBeVisible();

      // Another admin, on another computer, moves the order on.
      const otherContext = await browser.newContext({ serviceWorkers: 'block', extraHTTPHeaders: { 'X-Test-Session': testSession } });
      const other = new AdminPage(await otherContext.newPage());
      await other.logIn(second.email, second.password);
      await other.openOrders();
      await other.searchOrders(order.number);
      const otherRow = other.orderRow(order.id);
      await otherRow.getByTestId('admin-order-edit').click();
      await otherRow.getByTestId('admin-order-status-select').selectOption('processing');
      await otherRow.getByTestId('admin-order-save').click();
      await expect(otherRow.getByTestId('admin-order-status')).toHaveText('processing');
      await otherContext.close();

      return { order, row, admin: first };
    }

    test('says the order was changed by someone else and shows its current status', async ({
      browser,
      page,
      testSession,
      request,
      hooks,
      customer,
    }) => {
      const { order, row, admin } = await staleGrid(browser, page, testSession, request, hooks, customer);
      try {
        await row.getByTestId('admin-order-edit').click();
        await row.getByTestId('admin-order-status-select').selectOption('cancelled');
        await row.getByTestId('admin-order-save').click();

        await expect(page.getByTestId('toast-message').last()).toHaveText(changedElsewhere(order.number));
        await expect(row.getByTestId('admin-order-status')).toHaveText('processing');
      } finally {
        await cancelOrder(request, admin, order);
      }
    });

    test('defect lost-update lets the stale grid overwrite the other admin', async ({
      browser,
      page,
      testSession,
      request,
      hooks,
      customer,
    }) => {
      await setBug(request, 'lost-update');
      const { order, row, admin } = await staleGrid(browser, page, testSession, request, hooks, customer);
      try {
        await row.getByTestId('admin-order-edit').click();
        await row.getByTestId('admin-order-status-select').selectOption('cancelled');
        await row.getByTestId('admin-order-save').click();

        await expect(row.getByTestId('admin-order-status')).toHaveText('cancelled');
        await expect(page.getByTestId('toast-message').filter({ hasText: 'changed by someone else' })).toHaveCount(0);
      } catch (error) {
        await cancelOrder(request, admin, order).catch(() => undefined);
        throw error;
      }
    });
  });

  test.describe('PLS-21.4 the last item race', () => {
    // Both tests set the stock of the same product, so they take turns.
    test.describe.configure({ mode: 'serial' });
    // The serial group runs in one worker, so this cannot restore the stock while a race is on.
    test.afterAll(async () => {
      await restoreStock(RACE_SKU);
    });
    const RACERS = 20;

    /** Sets the race product's stock to 1, then has `RACERS` customers order it at the same moment. */
    async function race(request: APIRequestContext, hooks: import('../../support/hooks').TestHooks) {
      const admin = await hooks.createUser('admin');
      const lamp = product(RACE_SKU);
      const stocked = await updateProduct(request, admin, lamp.id, '*', { stock: 1 });
      expect(stocked.status(), 'Leave one item in stock').toBe(200);

      const customers = await Promise.all(Array.from({ length: RACERS }, () => hooks.createUser('customer')));
      for (const racer of customers) {
        const added = await request.post(`${API_URL}/api/v1/cart/items`, {
          headers: { Authorization: `Bearer ${racer.accessToken}` },
          data: { productId: lamp.id, quantity: 1 },
        });
        expect(added.status()).toBe(201);
      }
      const responses = await Promise.all(
        customers.map((racer) =>
          request.post(ordersUrl, {
            headers: { Authorization: `Bearer ${racer.accessToken}` },
            data: {
              shipping: { fullName: 'Racer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' },
              deliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
              payment: { nameOnCard: 'Racer', cardNumber: '4242424242424242', expiry: '12/30', cvc: '123' },
            },
          }),
        ),
      );
      const orders = await Promise.all(
        responses.filter((r) => r.status() === 201).map(async (r) => ((await r.json()) as { data: { id: number; number: string } }).data),
      );
      return { statuses: responses.map((r) => r.status()), orders, lampId: lamp.id, admin };
    }

    test('PLS-21.4 exactly 1 of 20 simultaneous orders buys the last item and 19 get 409', async ({ request, hooks }) => {
      const { statuses, orders, lampId, admin } = await race(request, hooks);
      try {
        expect(
          statuses.filter((status) => status === 201),
          `Statuses: ${statuses.join(' ')}`,
        ).toHaveLength(1);
        expect(
          statuses.filter((status) => status === 409),
          `Statuses: ${statuses.join(' ')}`,
        ).toHaveLength(RACERS - 1);
        expect((await getProduct(request, lampId)).product.stock).toBe(0);
      } finally {
        for (const order of orders) await cancelOrder(request, admin, { ...order, status: 'paid', etag: '*' });
      }
    });

    test('PLS-21.4 defect stock-oversell sells the last item more than once', async ({ request, hooks }) => {
      await setBug(request, 'stock-oversell');
      const { statuses, orders, admin } = await race(request, hooks);
      try {
        expect(statuses.filter((status) => status === 201).length).toBeGreaterThan(1);
      } finally {
        for (const order of orders) await cancelOrder(request, admin, { ...order, status: 'paid', etag: '*' });
      }
    });
  });
});
