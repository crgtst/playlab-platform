import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../src/config';
import { app, resetStack } from './app';

beforeEach(resetStack);

async function scrape(): Promise<string> {
  const res = await request(app).get('/metrics').expect(200);
  expect(res.headers['content-type']).toMatch(/^text\/plain; version=0\.0\.4/);
  return res.text;
}

/** The value of one sample, matched on its name and (a subset of) its labels. */
function sample(text: string, name: string, labels: Record<string, string> = {}): number | undefined {
  for (const line of text.split('\n')) {
    const m = line.match(/^([a-zA-Z_:][\w:]*)(?:\{(.*)\})? (\S+)$/);
    if (!m || m[1] !== name) continue;
    const found = Object.fromEntries([...(m[2] ?? '').matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
    if (Object.entries(labels).every(([k, v]) => found[k] === v)) return Number(m[3]);
  }
  return undefined;
}

async function checkout(cardNumber: string) {
  const login = await request(app).post('/api/v1/auth/login').send({ email: 'customer@playlab.test', password: 'Password123!' });
  const auth = `Bearer ${login.body.accessToken}`;
  await request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: 1 }).expect(201);
  return request(app)
    .post('/api/v1/orders')
    .set('Authorization', auth)
    .send({
      shipping: { fullName: 'Casey Customer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' },
      deliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
      payment: { cardNumber, expiry: '12/30', cvc: '123', nameOnCard: 'Casey Customer' },
    });
}

describe('PLS-25.4 GET /metrics', () => {
  it('has a request-duration histogram by method, route and status', async () => {
    const before = sample(await scrape(), 'http_request_duration_seconds_count', { route: '/api/v1/categories', status: '200' }) ?? 0;
    await request(app).get('/api/v1/categories').expect(200);
    await request(app).get('/api/v1/categories').expect(200);
    await request(app).get('/api/v1/nope').expect(404);

    const text = await scrape();
    expect(sample(text, 'http_request_duration_seconds_count', { method: 'GET', route: '/api/v1/categories', status: '200' })).toBe(
      before + 2,
    );
    expect(sample(text, 'http_request_duration_seconds_bucket', { route: '/api/v1/categories', status: '200', le: '+Inf' })).toBe(
      before + 2,
    );
    expect(sample(text, 'http_request_duration_seconds_count', { route: 'unmatched', status: '404' })).toBeGreaterThanOrEqual(1);
  });

  it('is never rate limited', async () => {
    for (let i = 0; i <= config.rateLimitPerMin; i++) await request(app).get('/metrics').expect(200);
  });
});

describe('PLS-25.5 business metrics', () => {
  it('counts created orders and declined payments', async () => {
    const before = await scrape();
    expect((await checkout('4242 4242 4242 4242')).status).toBe(201);
    expect((await checkout('4000 0000 0000 0002')).status).toBe(402);

    const after = await scrape();
    expect(sample(after, 'playlab_orders_created_total')).toBe(sample(before, 'playlab_orders_created_total')! + 1);
    expect(sample(after, 'playlab_payments_declined_total')).toBe(sample(before, 'playlab_payments_declined_total')! + 1);
  });

  it('reports active defects and database pool usage', async () => {
    expect(sample(await scrape(), 'playlab_defects_active')).toBe(0);
    await request(app)
      .post('/test/bugs')
      .send({ enable: ['wrong-status-code', 'order-leak'] })
      .expect(200);

    const text = await scrape();
    expect(sample(text, 'playlab_defects_active')).toBe(2);
    for (const state of ['total', 'idle', 'waiting']) {
      expect(sample(text, 'playlab_db_pool_connections', { state })).toBeGreaterThanOrEqual(0);
    }
  });
});
