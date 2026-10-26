import { product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';
import { sample } from '../../support/metrics';
import { cancelOrder } from '../../support/orders';
import { request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

/**
 * These tests use state shared by every test: global defects, the whole-server counters, and the reset that ends every
 * session. Run beside other tests they would break them (and be broken by them), so they have a Playwright project of
 * their own that runs on its own: `npm run test:exclusive`. The tests take turns in the order written, and the last
 * one resets the stack.
 */
test.describe.configure({ mode: 'serial' });

const loginStatus = async (api: APIRequestContext) => (await api.post(`${API_URL}/api/v1/auth/login`, { data: {} })).status();

const placeOrder = (request: APIRequestContext, token: string, cardNumber: string) =>
  request.post(`${API_URL}/api/v1/orders`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      shipping: { fullName: 'Metrics Customer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' },
      deliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
      payment: { nameOnCard: 'Casey Customer', cardNumber, expiry: '12/30', cvc: '123' },
    },
  });

test.describe('PLS-25.5 business metrics', () => {
  test('an order placed and a card declined each raise their counter by exactly 1', async ({ request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const scrape = async () => (await request.get(`${API_URL}/metrics`)).text();
    const headers = { Authorization: `Bearer ${customer.accessToken}` };
    const added = await request.post(`${API_URL}/api/v1/cart/items`, { headers, data: { productId: product('BK-004').id, quantity: 1 } });
    expect(added.status()).toBe(201);

    const before = await scrape();
    const declined = await placeOrder(request, customer.accessToken, '4000 0000 0000 0002');
    expect(declined.status()).toBe(402);
    const placed = await placeOrder(request, customer.accessToken, '4242 4242 4242 4242');
    expect(placed.status()).toBe(201);
    const order = ((await placed.json()) as { data: { id: number; number: string } }).data;
    try {
      const after = await scrape();
      expect(sample(after, 'playlab_orders_created_total')).toBe(sample(before, 'playlab_orders_created_total')! + 1);
      expect(sample(after, 'playlab_payments_declined_total')).toBe(sample(before, 'playlab_payments_declined_total')! + 1);
    } finally {
      await cancelOrder(request, admin, { ...order, status: 'paid', etag: '*' });
    }
  });
});

test.describe('PLS-28 Test environment: global state', () => {
  test('PLS-28.2 with no session the global state applies, and sessions are not affected by it', async () => {
    const none = await playwrightRequest.newContext();
    const setup = await playwrightRequest.newContext();
    try {
      const created = await setup.post(`${API_URL}/test/sessions`);
      const { id } = (await created.json()) as { id: string };
      const inSession = await playwrightRequest.newContext({ extraHTTPHeaders: { 'X-Test-Session': id } });

      const enabled = await none.post(`${API_URL}/test/bugs`, { data: { enable: ['wrong-status-code'] } });
      expect(enabled.status()).toBe(200);
      try {
        // A validation failure is 422 normally and 500 with the defect on.
        expect(await loginStatus(none)).toBe(500);
        expect(await loginStatus(inSession)).toBe(422);
      } finally {
        await none.post(`${API_URL}/test/bugs`, { data: { disable: ['wrong-status-code'] } });
      }
      expect(await loginStatus(none)).toBe(422);
      await inSession.dispose();
    } finally {
      await Promise.all([none.dispose(), setup.dispose()]);
    }
  });

  // Last: a reset ends every session, including the ones the other tests' fixtures made.
  test('PLS-28.9 a reset removes every session, and their hook calls then return 404 TEST_SESSION_NOT_FOUND', async () => {
    const api = await playwrightRequest.newContext();
    try {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) ids.push(((await (await api.post(`${API_URL}/test/sessions`)).json()) as { id: string }).id);
      const withDefect = await api.post(`${API_URL}/test/bugs`, {
        headers: { 'X-Test-Session': ids[0] },
        data: { enable: ['wrong-status-code'] },
      });
      expect(withDefect.status()).toBe(200);
      expect((await api.get(`${API_URL}/test/bugs`, { headers: { 'X-Test-Session': ids[1] } })).status()).toBe(200);

      expect((await api.post(`${API_URL}/test/reset`)).status()).toBe(200);

      for (const id of ids) {
        const gone = await api.get(`${API_URL}/test/bugs`, { headers: { 'X-Test-Session': id } });
        expect(gone.status()).toBe(404);
        expect(((await gone.json()) as { error: { code: string } }).error.code).toBe('TEST_SESSION_NOT_FOUND');
      }
      // Their state went with them: the old session's defect no longer applies.
      const login = await api.post(`${API_URL}/api/v1/auth/login`, { headers: { 'X-Test-Session': ids[0] }, data: {} });
      expect(login.status()).toBe(422);
    } finally {
      await api.dispose();
    }
  });
});
