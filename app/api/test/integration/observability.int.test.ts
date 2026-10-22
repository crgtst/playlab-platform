import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, resetStack } from './app';

const CUSTOMER = { email: 'customer@playlab.test', password: 'Password123!' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type LogLine = Record<string, unknown> & {
  time: string;
  durationMs: number;
  req: { headers: Record<string, string>; body: Record<string, unknown> & { payment?: Record<string, string> } };
};

beforeEach(resetStack);

async function logIn() {
  const res = await request(app).post('/api/v1/auth/login').send(CUSTOMER).expect(200);
  return res.body.accessToken as string;
}

async function logLines(correlationId: string) {
  const res = await request(app).get('/test/logs').query({ correlationId }).expect(200);
  return res.body.data as LogLine[];
}

describe('PLS-25.1 correlation IDs', () => {
  it('echoes a valid X-Correlation-Id', async () => {
    const res = await request(app).get('/api/v1/categories').set('X-Correlation-Id', 'abc-123_XYZ');
    expect(res.headers['x-correlation-id']).toBe('abc-123_XYZ');
  });

  it('generates a UUID when there is none', async () => {
    const res = await request(app).get('/api/v1/categories');
    expect(res.headers['x-correlation-id']).toMatch(UUID);
  });

  it.each([['a'.repeat(65)], ['has space'], ['../etc'], ['']])('replaces an invalid one (%j) with a UUID', async (id) => {
    const res = await request(app).get('/api/v1/categories').set('X-Correlation-Id', id);
    expect(res.headers['x-correlation-id']).toMatch(UUID);
  });
});

describe('PLS-10.1 error bodies carry the correlation ID', () => {
  it.each([
    ['404', () => request(app).get('/api/v1/nope')],
    ['422', () => request(app).post('/api/v1/auth/login').send({})],
    ['401', () => request(app).get('/api/v1/orders')],
  ])('on a %s', async (_status, send) => {
    const res = await send().set('X-Correlation-Id', 'err-check');
    expect(res.body.error).toMatchObject({ code: expect.any(String), message: expect.any(String), correlationId: 'err-check' });
    expect(Object.keys(res.body.error)).toEqual(['code', 'message', 'details', 'correlationId']);
  });
});

describe('PLS-25.2 GET /test/logs', () => {
  it("returns one request's log line with every field", async () => {
    const token = await logIn();
    await request(app)
      .post('/test/bugs')
      .send({ enable: ['wrong-status-code'] })
      .expect(200);
    await request(app).get('/api/v1/orders/9999').set('Authorization', `Bearer ${token}`).set('X-Correlation-Id', 'pls-25-2').expect(404);

    const lines = await logLines('pls-25-2');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      correlationId: 'pls-25-2',
      method: 'GET',
      route: '/api/v1/orders/:id',
      path: '/api/v1/orders/9999',
      status: 404,
      userId: 1,
      testSession: null,
      defects: ['wrong-status-code'],
      error: { code: 'NOT_FOUND', message: 'Order not found' },
    });
    expect(new Date(lines[0].time).toISOString()).toBe(lines[0].time);
    expect(lines[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('logs a request that matched no route', async () => {
    await request(app).get('/api/v1/nope').set('X-Correlation-Id', 'no-route');
    const [line] = await logLines('no-route');
    expect(line).toMatchObject({ route: null, status: 404, userId: null });
  });

  it('does not log the container healthcheck', async () => {
    await request(app).get('/api/v1/health/live').set('X-Correlation-Id', 'healthcheck').expect(200);
    expect(await logLines('healthcheck')).toEqual([]);
  });

  it('needs a valid correlationId', async () => {
    const res = await request(app).get('/test/logs').expect(422);
    expect(res.body.error.details[0].field).toBe('correlationId');
  });

  it('forgets every line on reset', async () => {
    await request(app).get('/api/v1/categories').set('X-Correlation-Id', 'before-reset');
    await resetStack();
    expect(await logLines('before-reset')).toEqual([]);
  });
});

describe('PLS-25.3 redaction', () => {
  it('hides the password on login', async () => {
    await request(app).post('/api/v1/auth/login').set('X-Correlation-Id', 'login').send(CUSTOMER).expect(200);
    const [line] = await logLines('login');
    expect(line.req.body).toEqual({ email: CUSTOMER.email, password: '[REDACTED]' });
    expect(JSON.stringify(line)).not.toContain(CUSTOMER.password);
  });

  it('hides the Authorization header, cookies and card details on a card payment', async () => {
    const token = await logIn();
    const auth = `Bearer ${token}`;
    await request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: 1, quantity: 1 }).expect(201);
    const deliveryDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await request(app)
      .post('/api/v1/orders')
      .set('Authorization', auth)
      .set('Cookie', 'session=secret-cookie-value')
      .set('X-Correlation-Id', 'card-payment')
      .send({
        shipping: { fullName: 'Casey Customer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' },
        deliveryDate,
        payment: { cardNumber: '4242 4242 4242 4242', expiry: '12/30', cvc: '123', nameOnCard: 'Casey Customer' },
      })
      .expect(201);

    const [line] = await logLines('card-payment');
    expect(line.req.headers.authorization).toBe('[REDACTED]');
    expect(line.req.headers.cookie).toBe('[REDACTED]');
    expect(line.req.body.payment).toMatchObject({ cardNumber: '[REDACTED]', cvc: '[REDACTED]', expiry: '[REDACTED]' });
    const raw = JSON.stringify(line);
    for (const secret of [token, 'secret-cookie-value', '4242 4242 4242 4242']) expect(raw).not.toContain(secret);
  });
});
