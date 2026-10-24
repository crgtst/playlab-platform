import { randomUUID } from 'node:crypto';
import { cards, product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';

const API_V1 = `${API_URL}/api/v1`;
const productForOrder = product('EL-001');
const shipping = {
  fullName: 'API Standards Test',
  line1: '1 Main Street',
  city: 'Dublin',
  postcode: 'D01 F5P2',
  country: 'IE',
};

function invalidRegistration() {
  return {
    name: 'Invalid API User',
    email: `invalid-${randomUUID()}@playlab.test`,
    password: 'short',
  };
}

test.describe('PLS-10 API standards', () => {
  test('PLS-10.1 API errors include the standard envelope and matching correlation ID', async ({ request }) => {
    const correlationId = `pls10-${randomUUID()}`;
    const response = await request.post(`${API_V1}/auth/register`, {
      headers: { 'X-Correlation-Id': correlationId },
      data: invalidRegistration(),
    });

    expect(response.status()).toBe(422);
    expect(response.headers()['x-correlation-id']).toBe(correlationId);
    const body = (await response.json()) as {
      error: { code: string; message: string; details: unknown; correlationId: string };
    };
    expect(Object.keys(body.error).sort()).toEqual(['code', 'correlationId', 'details', 'message']);
    expect(body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.any(String),
      correlationId,
    });
    expect(body.error.details).not.toBeNull();
  });

  test('PLS-10.2 invalid registration input returns 422 instead of 500', async ({ request }) => {
    const response = await request.post(`${API_V1}/auth/register`, { data: invalidRegistration() });

    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
  });

  test('PLS-10.2 detects the wrong-status-code defect', async ({ request }) => {
    const enabled = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['wrong-status-code'] } });
    expect(enabled.status()).toBe(200);

    const response = await request.post(`${API_V1}/auth/register`, { data: invalidRegistration() });
    expect(response.status()).toBe(500);
    expect((await response.json()).error.code).toBe('INTERNAL_ERROR');
  });

  test('PLS-10.3 the 101st request in a minute returns 429 with Retry-After', async ({ request }) => {
    for (let count = 0; count < 100; count++) {
      const response = await request.get(`${API_V1}/categories`);
      expect(response.status(), `Request ${count + 1} of the allowed 100`).toBe(200);
    }

    const limited = await request.get(`${API_V1}/categories`);
    expect(limited.status()).toBe(429);
    const retryAfter = limited.headers()['retry-after'];
    expect(retryAfter).toMatch(/^\d+$/);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  test('PLS-10.5 replaying an order with the same Idempotency-Key creates one order', async ({
    request,
    customer,
  }) => {
    const headers = { Authorization: `Bearer ${customer.accessToken}` };
    const cartResponse = await request.post(`${API_V1}/cart/items`, {
      headers,
      data: { productId: productForOrder.id, quantity: 1 },
    });
    expect(cartResponse.status()).toBe(201);

    const key = randomUUID();
    const orderBody = {
      shipping,
      deliveryDate: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
      payment: {
        nameOnCard: 'API Standards Test',
        cardNumber: cards.success.number.replaceAll(' ', ''),
        expiry: '12/30',
        cvc: '123',
      },
    };
    let orderId: number | undefined;

    try {
      const first = await request.post(`${API_V1}/orders`, {
        headers: { ...headers, 'Idempotency-Key': key },
        data: orderBody,
      });
      expect(first.status()).toBe(201);
      const firstOrder = (await first.json()).data as { id: number };
      orderId = firstOrder.id;

      const replay = await request.post(`${API_V1}/orders`, {
        headers: { ...headers, 'Idempotency-Key': key },
        data: orderBody,
      });
      expect(replay.status()).toBe(200);
      expect(replay.headers()['idempotent-replayed']).toBe('true');
      expect((await replay.json()).data.id).toBe(orderId);

      const orders = await request.get(`${API_V1}/orders`, { headers });
      expect(orders.status()).toBe(200);
      const orderList = (await orders.json()).data as { id: number }[];
      expect(orderList.filter((order) => order.id === orderId)).toHaveLength(1);
    } finally {
      if (orderId !== undefined) {
        const cancelled = await request.post(`${API_V1}/orders/${orderId}/cancel`, { headers });
        expect(cancelled.status(), 'Cancel the test order and restore product stock').toBe(200);
      }
    }
  });

  test('PLS-10.6 a product read with a matching If-None-Match returns 304', async ({ request }) => {
    const productResponse = await request.get(`${API_V1}/products/${productForOrder.id}`);
    expect(productResponse.status()).toBe(200);
    const etag = productResponse.headers().etag;
    if (!etag) throw new Error('Product response did not include an ETag');

    const notModified = await request.get(`${API_V1}/products/${productForOrder.id}`, {
      headers: { 'If-None-Match': etag },
    });
    expect(notModified.status()).toBe(304);
    expect(await notModified.text()).toBe('');
  });
});
