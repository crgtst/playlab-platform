import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../src/config';
import { query } from '../../src/db/pool';
import { app, resetStack } from './app';

const rateLimit = config.rateLimitPerMin;

beforeEach(resetStack);
afterEach(() => {
  config.rateLimitPerMin = rateLimit;
});

const body = { products: 300, users: 20, ordersPerUser: 3, seed: 42 };

/** Everything a generated seed creates, in a form two runs can be compared on. */
async function snapshot() {
  return {
    products: await query(
      `SELECT id, sku, name, category_id, price_cents, stock, created_at FROM products WHERE sku LIKE 'G42-%' ORDER BY id`,
    ),
    users: await query(`SELECT id, email, name, created_at FROM users WHERE email LIKE 'gen-42-%' ORDER BY id`),
    orders: await query(
      `SELECT o.id, o.number, o.user_id, o.status, o.total_cents, o.created_at FROM orders o JOIN users u ON u.id = o.user_id
        WHERE u.email LIKE 'gen-42-%' ORDER BY o.id`,
    ),
    items: await query(
      `SELECT i.order_id, i.product_id, i.quantity FROM order_items i JOIN orders o ON o.id = i.order_id JOIN users u ON u.id = o.user_id
        WHERE u.email LIKE 'gen-42-%' ORDER BY i.order_id, i.product_id`,
    ),
  };
}

describe('POST /test/generate', () => {
  it('PLS-28.3 creates identical data from the same body and seed after a reset', async () => {
    const first = await request(app).post('/test/generate').send(body).expect(201);
    const one = await snapshot();
    await resetStack();
    const second = await request(app).post('/test/generate').send(body).expect(201);
    const two = await snapshot();

    expect(first.body).toMatchObject({ products: 300, users: 20, orders: 60, seed: 42 });
    expect(one.products).toHaveLength(300);
    expect(one.orders).toHaveLength(60);
    expect(two).toEqual(one);
    expect(second.body.checksum).toBe(first.body.checksum);
  });

  it('PLS-28.3 creates different data from a different seed', async () => {
    const a = await request(app).post('/test/generate').send(body).expect(201);
    const b = await request(app)
      .post('/test/generate')
      .send({ ...body, seed: 43 })
      .expect(201);
    expect(b.body.checksum).not.toBe(a.body.checksum);
  });

  it('PLS-28.3 produces orders whose totals add up and whose users can log in', async () => {
    await request(app).post('/test/generate').send(body).expect(201);
    const bad = await query(`SELECT number FROM orders WHERE total_cents <> subtotal_cents - discount_cents + vat_cents + delivery_cents`);
    expect(bad).toEqual([]);
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'gen-42-000001@playlab.test', password: 'Password123!' });
    expect(login.status).toBe(200);
  });

  it('PLS-28.3 lists the generated products through the public API', async () => {
    await request(app).post('/test/generate').send({ products: 120, users: 0, ordersPerUser: 0, seed: 7 }).expect(201);
    const res = await request(app).get('/api/v1/products?limit=1').expect(200);
    expect(res.body.meta.total).toBe(160);
  });

  it('PLS-28.3 refuses the same seed twice without a reset', async () => {
    await request(app).post('/test/generate').send(body).expect(201);
    const res = await request(app).post('/test/generate').send(body).expect(409);
    expect(res.body.error.code).toBe('GENERATE_CONFLICT');
  });

  it('PLS-28.3 rejects counts outside the limits', async () => {
    await request(app).post('/test/generate').send({ products: 50001 }).expect(422);
    await request(app).post('/test/generate').send({ users: -1 }).expect(422);
    await request(app).post('/test/generate').send({ seed: 'abc' }).expect(422);
  });
});

describe('POST /test/users/bulk', () => {
  it('PLS-28.4 returns a CSV of 500 accounts and every one can log in', async () => {
    const res = await request(app).post('/test/users/bulk').send({ count: 500 }).expect(201);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe('email,password,token');
    const rows = lines.slice(1).map((l) => l.split(','));
    expect(rows).toHaveLength(500);
    expect(new Set(rows.map((r) => r[0])).size).toBe(500);

    // Every password logs in (500 logins would hit the rate limit, so it is off for this test), and a token from the file works as is.
    config.rateLimitPerMin = 0;
    const statuses: number[] = [];
    for (let i = 0; i < rows.length; i += 25) {
      const batch = await Promise.all(
        rows.slice(i, i + 25).map(([email, password]) => request(app).post('/api/v1/auth/login').send({ email, password })),
      );
      statuses.push(...batch.map((r) => r.status));
    }
    expect(statuses.filter((s) => s !== 200)).toEqual([]);
    await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${rows[499][2]}`).expect(200);
  }, 60_000);

  it('PLS-28.4 gives each call its own accounts', async () => {
    const a = await request(app).post('/test/users/bulk').send({ count: 5 }).expect(201);
    const b = await request(app).post('/test/users/bulk').send({ count: 5 }).expect(201);
    const emails = (r: request.Response) =>
      r.text
        .trim()
        .split('\r\n')
        .slice(1)
        .map((l) => l.split(',')[0]);
    expect(emails(a).filter((e) => emails(b).includes(e))).toEqual([]);
  });

  it('PLS-28.4 rejects a count that is missing, zero, too big or not a whole number', async () => {
    for (const payload of [{}, { count: 0 }, { count: 5001 }, { count: 1.5 }, { count: '5' }]) {
      await request(app).post('/test/users/bulk').send(payload).expect(422);
    }
  });
});
