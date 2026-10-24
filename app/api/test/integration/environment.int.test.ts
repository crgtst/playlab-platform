import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { config } from '../../src/config';
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

  it('PLS-12.2 test endpoints return 404 when test hooks are disabled', async () => {
    const testHooks = config.testHooks;
    config.testHooks = false;
    try {
      const appWithoutHooks = createApp();
      const responses = await Promise.all([
        request(appWithoutHooks).get('/test'),
        request(appWithoutHooks).post('/test/reset'),
        request(appWithoutHooks).get('/test/bugs'),
        request(appWithoutHooks)
          .post('/test/bugs')
          .send({ enable: ['search-apostrophe'] }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    } finally {
      config.testHooks = testHooks;
    }
  });

  it('PLS-12.3 enabling one named defect changes only its targeted behavior', async () => {
    await request(app).get('/api/v1/products').query({ q: "O'Neill" }).expect(200);

    await request(app)
      .post('/test/bugs')
      .send({ enable: ['search-apostrophe'] })
      .expect(200);
    const activeBugs = await request(app).get('/test/bugs').expect(200);
    expect(activeBugs.body.data.filter((bug: { enabled: boolean }) => bug.enabled).map((bug: { name: string }) => bug.name)).toEqual([
      'search-apostrophe',
    ]);

    await request(app).get('/api/v1/products').query({ q: "O'Neill" }).expect(500);
    await request(app).get('/api/v1/products').query({ q: 'earbuds' }).expect(200);
    await request(app).get('/api/v1/products/1').expect(200);
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
