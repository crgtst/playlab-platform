import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../src/db/pool';
import { app, resetStack } from './app';

beforeEach(resetStack);

describe('test environment', () => {
  it('PLS-29.5 runs against its own freshly seeded database', async () => {
    const [{ db }] = await query<{ db: string }>('SELECT current_database() AS db');
    expect(db).toBe(new URL(process.env.DATABASE_URL!).pathname.slice(1));
    const [{ users, products }] = await query<{ users: number; products: number }>(
      'SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM products) AS products',
    );
    expect({ users, products }).toEqual({ users: 3, products: 40 });
  });

  it('PLS-12.1 reset returns all data to the base seed within 5 seconds', async () => {
    await request(app).post('/test/users').send({ role: 'customer' }).expect(201);
    await request(app)
      .post('/test/seed')
      .send({ fixtures: ['customer-with-orders'] })
      .expect(201);
    const [{ before }] = await query<{ before: number }>('SELECT COUNT(*) AS before FROM users');
    expect(before).toBeGreaterThan(3);

    const res = await request(app).post('/test/reset').expect(200);
    expect(res.body.durationMs).toBeLessThan(5000);
    const [{ users, orders }] = await query<{ users: number; orders: number }>(
      'SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM orders) AS orders',
    );
    expect({ users, orders }).toEqual({ users: 3, orders: 0 });
  });

  it('PLS-12.4 readiness needs the web app, liveness only the database', async () => {
    const ready = await request(app).get('/api/v1/health');
    expect(ready.status).toBe(503);
    expect(ready.body.checks).toEqual({ api: 'up', db: 'up', web: 'down' });

    const live = await request(app).get('/api/v1/health/live');
    expect(live.status).toBe(200);
    expect(live.body.checks).toEqual({ api: 'up', db: 'up' });
  });
});
