import { OrdersPage } from '../../pages/OrdersPage';
import { cards, product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import type { TestUser } from '../../support/hooks';

const ordersUrl = `${API_URL}/api/v1/orders`;
const orderProduct = product('EL-001');
const shipping = {
  fullName: 'Orders Test Customer',
  line1: '1 Main Street',
  city: 'Dublin',
  postcode: 'D01 F5P2',
  country: 'IE',
};

interface Order {
  id: number;
  number: string;
  status: string;
  createdAt: string;
  etag: string;
  items: { productId: number; unitPriceCents: number; quantity: number }[];
}

async function createOrder(request: APIRequestContext, user: TestUser): Promise<Order> {
  const headers = { Authorization: `Bearer ${user.accessToken}` };
  const added = await request.post(`${API_URL}/api/v1/cart/items`, {
    headers,
    data: { productId: orderProduct.id, quantity: 1 },
  });
  expect(added.status(), 'Add order product to the isolated customer cart').toBe(201);

  const placed = await request.post(ordersUrl, {
    headers,
    data: {
      shipping,
      deliveryDate: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
      payment: {
        nameOnCard: 'Casey Customer',
        cardNumber: cards.success.number.replaceAll(' ', ''),
        expiry: '12/30',
        cvc: '123',
      },
    },
  });
  expect(placed.status(), 'Place isolated test order').toBe(201);
  const body = (await placed.json()) as { data: Order };
  return body.data;
}

async function listOrders(request: APIRequestContext, user: TestUser): Promise<Order[]> {
  const response = await request.get(`${ordersUrl}?limit=100`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });
  expect(response.status(), 'List orders for the isolated customer').toBe(200);
  const body = (await response.json()) as { data: Order[] };
  return body.data;
}

async function restoreStock(request: APIRequestContext, user: TestUser, orders: Order[]) {
  for (const order of orders) {
    const response = await request.post(`${ordersUrl}/${order.id}/cancel`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(response.status(), `Cancel order ${order.number} and restore product stock`).toBe(200);
  }
}

async function logIn(page: Page, user: TestUser) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function setBug(request: APIRequestContext, bug: string) {
  const response = await request.post(`${API_URL}/test/bugs`, { data: { enable: [bug] } });
  expect(response.status(), `Enable ${bug} defect mode`).toBe(200);
}

async function createLateEveningOrder(
  request: APIRequestContext,
  hooks: {
    advanceClock(ms: number): Promise<void>;
    createUser(role?: TestUser['role']): Promise<TestUser>;
  },
) {
  const now = new Date();
  const lateUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6, 30));
  if (lateUtc.getTime() <= now.getTime()) lateUtc.setUTCDate(lateUtc.getUTCDate() + 1);
  await hooks.advanceClock(lateUtc.getTime() - now.getTime());
  const user = await hooks.createUser('customer');
  return { user, order: await createOrder(request, user) };
}

test.describe('PLS-7 Orders and access control', () => {
  test('PLS-7.1 order history shows only this customer’s orders, newest first', async ({ page, request, hooks, customer }) => {
    const otherCustomer = await hooks.createUser('customer');
    const ownedOrders: Order[] = [];
    let otherOrder: Order | undefined;
    try {
      ownedOrders.push(await createOrder(request, customer));
      await hooks.advanceClock(60_000);
      ownedOrders.push(await createOrder(request, customer));
      otherOrder = await createOrder(request, otherCustomer);

      await logIn(page, customer);
      const history = new OrdersPage(page);
      await history.openHistory();
      await expect(history.history).toBeVisible();
      await expect(history.rows).toHaveCount(ownedOrders.length);
      const visibleIds = await history.rows.evaluateAll((rows) => rows.map((row) => Number(row.getAttribute('data-order-id'))));
      const newestFirst = [...ownedOrders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id);
      expect(visibleIds).toEqual(newestFirst.map((order) => order.id));
      expect(visibleIds).not.toContain(otherOrder.id);
    } finally {
      await restoreStock(request, customer, ownedOrders);
      if (otherOrder) await restoreStock(request, otherCustomer, [otherOrder]);
    }
  });

  test('PLS-7.2 one customer receives 404 for another customer’s order', async ({ request, hooks, customer }) => {
    const otherCustomer = await hooks.createUser('customer');
    const order = await createOrder(request, otherCustomer);
    try {
      const response = await request.get(`${ordersUrl}/${order.id}`, {
        headers: { Authorization: `Bearer ${customer.accessToken}` },
      });
      expect(response.status()).toBe(404);
    } finally {
      await restoreStock(request, otherCustomer, [order]);
    }
  });

  test('PLS-7.2 detects the order-leak defect', async ({ request, hooks, customer }) => {
    const otherCustomer = await hooks.createUser('customer');
    const order = await createOrder(request, otherCustomer);
    try {
      await setBug(request, 'order-leak');
      const response = await request.get(`${ordersUrl}/${order.id}`, {
        headers: { Authorization: `Bearer ${customer.accessToken}` },
      });
      expect(response.status()).toBe(200);
      expect(((await response.json()) as { data: Order }).data.id).toBe(order.id);
    } finally {
      await restoreStock(request, otherCustomer, [order]);
    }
  });

  test.describe('PLS-7.3 browser-local order date', () => {
    test.use({ timezoneId: 'America/Los_Angeles' });

    test('PLS-7.3 an order placed late in the evening shows the browser’s local date', async ({ page, request, hooks }) => {
      const { user, order } = await createLateEveningOrder(request, hooks);
      try {
        await logIn(page, user);
        const history = new OrdersPage(page);
        await history.openHistory();
        const date = history.row(order.id).getByTestId('order-row-date');
        await expect(date).toBeVisible();
        const timestamp = await date.getAttribute('datetime');
        if (!timestamp) throw new Error('Order history date is missing its datetime value');
        const expectedLocalDate = await page.evaluate(
          (value) => new Date(value).toLocaleDateString('en-IE', { year: 'numeric', month: 'short', day: 'numeric' }),
          timestamp,
        );
        const localAndUtcDateDiffer = await page.evaluate((value) => {
          const date = new Date(value);
          return date.getUTCDate() !== date.getDate();
        }, timestamp);
        expect(localAndUtcDateDiffer).toBe(true);
        await expect(date).toHaveText(expectedLocalDate);
      } finally {
        await restoreStock(request, user, [order]);
      }
    });

    test('PLS-7.3 detects the timezone-off-by-one defect', async ({ page, request, hooks }) => {
      const { user, order } = await createLateEveningOrder(request, hooks);
      try {
        await setBug(request, 'timezone-off-by-one');
        await logIn(page, user);
        const history = new OrdersPage(page);
        await history.openHistory();
        const date = history.row(order.id).getByTestId('order-row-date');
        await expect(date).toBeVisible();
        const timestamp = await date.getAttribute('datetime');
        if (!timestamp) throw new Error('Order history date is missing its datetime value');
        const utcDate = await page.evaluate(
          (value) =>
            new Date(value).toLocaleDateString('en-IE', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
            }),
          timestamp,
        );
        await expect(date).toHaveText(utcDate);
        const localAndUtcDateDiffer = await page.evaluate((value) => {
          const date = new Date(value);
          return date.getUTCDate() !== date.getDate();
        }, timestamp);
        expect(localAndUtcDateDiffer).toBe(true);
      } finally {
        await restoreStock(request, user, [order]);
      }
    });
  });

  test('PLS-7.4 an open order page updates its status live without a refresh', async ({ page, request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer);
    try {
      await logIn(page, customer);
      await page.goto(`/account/orders/${order.id}`);
      await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'paid');
      await expect(page.getByTestId('live-indicator')).toHaveAttribute('data-state', 'open');

      const changed = await request.patch(`${ordersUrl}/${order.id}/status`, {
        headers: { Authorization: `Bearer ${admin.accessToken}`, 'If-Match': order.etag },
        data: { status: 'processing' },
      });
      expect(changed.status()).toBe(200);
      await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'processing');
      await expect(page).toHaveURL(`/account/orders/${order.id}`);

      const updated = (await changed.json()) as { data: Order };
      const cancelled = await request.patch(`${ordersUrl}/${order.id}/status`, {
        headers: { Authorization: `Bearer ${admin.accessToken}`, 'If-Match': updated.data.etag },
        data: { status: 'cancelled' },
      });
      expect(cancelled.status()).toBe(200);
    } finally {
      const current = await request.get(`${ordersUrl}/${order.id}`, {
        headers: { Authorization: `Bearer ${customer.accessToken}` },
      });
      if (current.status() === 200) {
        const currentOrder = (await current.json()) as { data: Order };
        if (currentOrder.data.status !== 'cancelled') {
          const cancelled = await request.patch(`${ordersUrl}/${order.id}/status`, {
            headers: { Authorization: `Bearer ${admin.accessToken}`, 'If-Match': currentOrder.data.etag },
            data: { status: 'cancelled' },
          });
          expect(cancelled.status(), 'Cancel the updated test order and restore stock').toBe(200);
        }
      }
    }
  });

  test('PLS-7.5 a customer sees a 403 page at an admin URL', async ({ page, customer }) => {
    await logIn(page, customer);
    await page.goto('/admin');
    await expect(page.getByTestId('forbidden')).toBeVisible();
    await expect(page.getByRole('heading', { name: '403 – Access denied' })).toBeVisible();
  });
});
