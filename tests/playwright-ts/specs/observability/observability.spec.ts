import { sample } from '../../support/metrics';
import { API_URL, expect, test } from '../../support/fixtures';
import { cancelOrder, createOrder } from '../../support/orders';
import { product } from '../../support/data';
import type { APIRequestContext } from '@playwright/test';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

interface LogLine {
  time: string;
  correlationId: string;
  method: string;
  route: string | null;
  path: string;
  status: number;
  durationMs: number;
  userId: number | null;
  testSession: string | null;
  defects: string[];
  req: { headers: Record<string, string>; body: Record<string, unknown> & { payment?: Record<string, string> } };
}

async function logLines(request: APIRequestContext, correlationId: string): Promise<LogLine[]> {
  const response = await request.get(`${API_URL}/test/logs`, { params: { correlationId } });
  expect(response.status(), `GET /test/logs for ${correlationId}`).toBe(200);
  return ((await response.json()) as { data: LogLine[] }).data;
}

const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

test.describe('PLS-25 Observability', () => {
  test.describe('PLS-25.1 correlation IDs', () => {
    test('a valid X-Correlation-Id is echoed back', async ({ request }) => {
      for (const id of ['abc-123_XYZ', 'a'.repeat(64), 'x']) {
        const response = await request.get(`${API_URL}/api/v1/categories`, { headers: { 'X-Correlation-Id': id } });
        expect(response.headers()['x-correlation-id']).toBe(id);
      }
    });

    test('with no ID, or an invalid one, a new UUID is returned', async ({ request }) => {
      const none = await request.get(`${API_URL}/api/v1/categories`);
      expect(none.headers()['x-correlation-id']).toMatch(UUID);

      for (const invalid of ['a'.repeat(65), 'has space', '../etc', 'semi;colon']) {
        const response = await request.get(`${API_URL}/api/v1/categories`, { headers: { 'X-Correlation-Id': invalid } });
        expect(response.headers()['x-correlation-id'], `ID ${JSON.stringify(invalid)} is replaced`).toMatch(UUID);
      }
    });
  });

  test("PLS-25.2 a request's log line has every field", async ({ request, testSession, customer }) => {
    const id = unique('pls-25-2');
    const missing = await request.get(`${API_URL}/api/v1/orders/999999`, {
      headers: { ...bearer(customer.accessToken), 'X-Correlation-Id': id },
    });
    expect(missing.status()).toBe(404);

    const lines = await logLines(request, id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      correlationId: id,
      method: 'GET',
      route: '/api/v1/orders/:id',
      path: '/api/v1/orders/999999',
      status: 404,
      userId: customer.id,
      testSession,
      defects: [],
    });
    expect(new Date(lines[0].time).toISOString()).toBe(lines[0].time);
    expect(lines[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  test('PLS-25.2 the log line names the defects active in the session', async ({ request }) => {
    const bug = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['wrong-status-code'] } });
    expect(bug.status()).toBe(200);
    const id = unique('pls-25-2-defects');
    await request.get(`${API_URL}/api/v1/categories`, { headers: { 'X-Correlation-Id': id } });

    expect((await logLines(request, id))[0].defects).toEqual(['wrong-status-code']);
  });

  test('PLS-25.3 a login log line has the password redacted', async ({ request, customer }) => {
    const id = unique('pls-25-3-login');
    const login = await request.post(`${API_URL}/api/v1/auth/login`, {
      headers: { 'X-Correlation-Id': id },
      data: { email: customer.email, password: customer.password },
    });
    expect(login.status()).toBe(200);

    const [line] = await logLines(request, id);
    expect(line.req.body).toEqual({ email: customer.email, password: '[REDACTED]' });
    expect(JSON.stringify(line)).not.toContain(customer.password);
  });

  test('PLS-25.3 a card payment log line has the Authorization header, cookies and card details redacted', async ({
    request,
    hooks,
    customer,
  }) => {
    const admin = await hooks.createUser('admin');
    const id = unique('pls-25-3-card');
    const headers = bearer(customer.accessToken);
    const added = await request.post(`${API_URL}/api/v1/cart/items`, { headers, data: { productId: product('BK-004').id, quantity: 1 } });
    expect(added.status()).toBe(201);
    const placed = await request.post(`${API_URL}/api/v1/orders`, {
      headers: { ...headers, Cookie: 'session=secret-cookie-value', 'X-Correlation-Id': id },
      data: {
        shipping: { fullName: 'Casey Customer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' },
        deliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
        payment: { cardNumber: '4242 4242 4242 4242', expiry: '12/30', cvc: '123', nameOnCard: 'Casey Customer' },
      },
    });
    expect(placed.status()).toBe(201);
    const order = ((await placed.json()) as { data: { id: number; number: string } }).data;
    try {
      const [line] = await logLines(request, id);
      expect(line.req.headers.authorization).toBe('[REDACTED]');
      expect(line.req.headers.cookie).toBe('[REDACTED]');
      expect(line.req.body.payment).toMatchObject({ cardNumber: '[REDACTED]', cvc: '[REDACTED]', expiry: '[REDACTED]' });
      const raw = JSON.stringify(line);
      for (const secret of [customer.accessToken, 'secret-cookie-value', '4242 4242 4242 4242', '4242424242424242']) {
        expect(raw, `the log line must not contain ${secret.slice(0, 8)}…`).not.toContain(secret);
      }
    } finally {
      await cancelOrder(request, admin, { ...order, status: 'paid', etag: '*' });
    }
  });

  test.describe('PLS-25.4 and 25.5 metrics', () => {
    const scrape = async (request: APIRequestContext) => {
      const response = await request.get(`${API_URL}/metrics`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toMatch(/^text\/plain; version=0\.0\.4/);
      return response.text();
    };

    test('a request-duration histogram by method, route and status, never rate limited', async ({ request }) => {
      // Other tests share these counters, so assert that they went up by at least what this test sent.
      const labels = { method: 'GET', route: '/api/v1/categories', status: '200' };
      const before = sample(await scrape(request), 'http_request_duration_seconds_count', labels) ?? 0;
      for (let i = 0; i < 3; i++) expect((await request.get(`${API_URL}/api/v1/categories`)).status()).toBe(200);
      expect((await request.get(`${API_URL}/api/v1/nope`)).status()).toBe(404);

      const text = await scrape(request);
      expect(sample(text, 'http_request_duration_seconds_count', labels)).toBeGreaterThanOrEqual(before + 3);
      expect(sample(text, 'http_request_duration_seconds_bucket', { ...labels, le: '+Inf' })).toBeGreaterThanOrEqual(before + 3);
      expect(sample(text, 'http_request_duration_seconds_count', { route: 'unmatched', status: '404' })).toBeGreaterThanOrEqual(1);

      // Scraping more often than the rate limit allows never gets a 429.
      for (let i = 0; i < 105; i++) expect((await request.get(`${API_URL}/metrics`)).status()).toBe(200);
    });

    test("the active-defects and database-pool gauges are present, and the defects gauge follows the scraping session's defects", async ({
      request,
    }) => {
      expect(sample(await scrape(request), 'playlab_defects_active')).toBe(0);
      const bug = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['wrong-status-code', 'order-leak'] } });
      expect(bug.status()).toBe(200);

      const text = await scrape(request);
      expect(sample(text, 'playlab_defects_active')).toBe(2);
      for (const state of ['total', 'idle', 'waiting']) {
        expect(sample(text, 'playlab_db_pool_connections', { state }), `pool gauge ${state}`).toBeGreaterThanOrEqual(0);
      }
    });

    test('the order and declined-payment counters are present and never go down', async ({ request, hooks, customer }) => {
      const admin = await hooks.createUser('admin');
      const before = await scrape(request);
      const order = await createOrder(request, customer, 'BK-004');
      try {
        const after = await scrape(request);
        expect(sample(after, 'playlab_orders_created_total')).toBeGreaterThanOrEqual(sample(before, 'playlab_orders_created_total')! + 1);
        expect(sample(after, 'playlab_payments_declined_total')).toBeGreaterThanOrEqual(sample(before, 'playlab_payments_declined_total')!);
      } finally {
        await cancelOrder(request, admin, order);
      }
    });
  });
});
