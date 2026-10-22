import { AddressInfo } from 'net';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../src/config';
import { app, resetStack } from './app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idleMs = config.testSessionIdleMs;

beforeEach(resetStack);
afterEach(() => {
  config.testSessionIdleMs = idleMs;
});

async function newSession(): Promise<string> {
  const res = await request(app).post('/test/sessions').expect(201);
  return res.body.id;
}

/** A validation failure: 422 normally, 500 with wrong-status-code on. */
async function loginStatus(session?: string) {
  const req = request(app).post('/api/v1/auth/login').send({});
  if (session) req.set('X-Test-Session', session);
  return (await req).status;
}

describe('PLS-28.6 POST /test/sessions', () => {
  it('returns the session id and sets the test_session cookie', async () => {
    const res = await request(app).post('/test/sessions').expect(201);
    expect(res.body).toEqual({ id: expect.stringMatching(UUID), idleTimeoutMs: idleMs });
    expect(res.headers['set-cookie'][0]).toMatch(new RegExp(`^test_session=${res.body.id};`));
  });
});

describe('PLS-28.1 sessions are isolated from each other', () => {
  it('keeps defects apart', async () => {
    const [a, b] = [await newSession(), await newSession()];
    await request(app)
      .post('/test/bugs')
      .set('X-Test-Session', a)
      .send({ enable: ['wrong-status-code'] })
      .expect(200);

    expect(await loginStatus(a)).toBe(500);
    expect(await loginStatus(b)).toBe(422);
    expect(await loginStatus()).toBe(422);
    const listed = await request(app).get('/test/bugs').set('X-Test-Session', b);
    expect(listed.body.data.filter((d: { enabled: boolean }) => d.enabled)).toEqual([]);
  });

  it('keeps chaos rules apart', async () => {
    const [a, b] = [await newSession(), await newSession()];
    await request(app)
      .post('/test/chaos')
      .set('X-Test-Session', a)
      .send({ path: '/api/v1/categories', failNext: 5, status: 503 })
      .expect(201);

    expect((await request(app).get('/api/v1/categories').set('X-Test-Session', a)).status).toBe(503);
    expect((await request(app).get('/api/v1/categories').set('X-Test-Session', b)).status).toBe(200);
    expect((await request(app).get('/api/v1/categories')).status).toBe(200);
  });

  it('keeps clocks apart', async () => {
    const [a, b] = [await newSession(), await newSession()];
    await request(app).post('/test/clock').set('X-Test-Session', a).send({ now: '2030-01-01T00:00:00.000Z' }).expect(200);

    expect((await request(app).get('/test/clock').set('X-Test-Session', a)).body.now).toMatch(/^2030-01-01T00:00/);
    expect((await request(app).get('/test/clock').set('X-Test-Session', b)).body.offsetMs).toBe(0);
    expect((await request(app).get('/test/clock')).body.offsetMs).toBe(0);
  });

  it('accepts the session from the test_session cookie', async () => {
    const a = await newSession();
    await request(app)
      .post('/test/bugs')
      .set('Cookie', `test_session=${a}`)
      .send({ enable: ['wrong-status-code'] })
      .expect(200);
    expect((await request(app).post('/api/v1/auth/login').set('Cookie', `test_session=${a}`).send({})).status).toBe(500);
    expect(await loginStatus()).toBe(422);
  });

  it('records the session in the request log', async () => {
    const a = await newSession();
    await request(app).get('/api/v1/categories').set('X-Test-Session', a).set('X-Correlation-Id', 'in-session');
    const logs = await request(app).get('/test/logs').query({ correlationId: 'in-session' });
    expect(logs.body.data[0].testSession).toBe(a);
  });
});

describe('PLS-28.2 requests with no session use the global state', () => {
  it('applies global defects to requests without a session, and not to sessions', async () => {
    const a = await newSession();
    await request(app)
      .post('/test/bugs')
      .send({ enable: ['wrong-status-code'] })
      .expect(200);
    expect(await loginStatus()).toBe(500);
    expect(await loginStatus(a)).toBe(422);
  });
});

describe('PLS-28.7 latency and rate limits are per session', () => {
  it('slows down only the session with the latency rule', async () => {
    const [a, b] = [await newSession(), await newSession()];
    await request(app).post('/test/latency').set('X-Test-Session', a).send({ path: '/api/v1/categories', delayMs: 300 }).expect(201);

    const timed = async (session: string) => {
      const started = Date.now();
      await request(app).get('/api/v1/categories').set('X-Test-Session', session).expect(200);
      return Date.now() - started;
    };
    expect(await timed(a)).toBeGreaterThanOrEqual(300);
    expect(await timed(b)).toBeLessThan(300);
  });

  it('gives each session its own rate-limit counter', async () => {
    const [a, b] = [await newSession(), await newSession()];
    for (let i = 0; i < config.rateLimitPerMin; i++) {
      await request(app).get('/api/v1/categories').set('X-Test-Session', a).expect(200);
    }
    expect((await request(app).get('/api/v1/categories').set('X-Test-Session', a)).status).toBe(429);
    expect((await request(app).get('/api/v1/categories').set('X-Test-Session', b)).status).toBe(200);
  });
});

describe('PLS-28.8 unknown and expired sessions', () => {
  it('refuses hook calls for an idle session and gives other requests the global state', async () => {
    config.testSessionIdleMs = 50;
    const a = await newSession();
    await new Promise((r) => setTimeout(r, 100));
    await request(app)
      .post('/test/bugs')
      .send({ enable: ['wrong-status-code'] })
      .expect(200);

    const hook = await request(app).get('/test/bugs').set('X-Test-Session', a);
    expect(hook.status).toBe(404);
    expect(hook.body.error.code).toBe('TEST_SESSION_NOT_FOUND');
    expect(await loginStatus(a)).toBe(500);
  });

  it('refuses hook calls for a session that never existed', async () => {
    const res = await request(app).post('/test/chaos').set('X-Test-Session', 'no-such-session').send({ path: '/x', failNext: 1 });
    expect(res.status).toBe(404);
    expect((await request(app).get('/test/chaos')).body.data).toEqual([]);
  });

  it('still lets you create a session or reset while naming an old one', async () => {
    await request(app).post('/test/sessions').set('X-Test-Session', 'stale').expect(201);
    await request(app).post('/test/reset').set('X-Test-Session', 'stale').expect(200);
  });
});

describe('PLS-28.9 reset ends every session', () => {
  it('removes all sessions and their state', async () => {
    const [a, b] = [await newSession(), await newSession()];
    await request(app)
      .post('/test/bugs')
      .set('X-Test-Session', a)
      .send({ enable: ['wrong-status-code'] })
      .expect(200);
    await request(app).post('/test/reset').expect(200);

    for (const id of [a, b]) expect((await request(app).get('/test/bugs').set('X-Test-Session', id)).status).toBe(404);
    expect(await loginStatus(a)).toBe(422);
  });
});

describe('PLS-28.10 the payment frame follows the shop session', () => {
  it("puts the session in the frame URL and serves the frame with that session's defects", async () => {
    const a = await newSession();
    await request(app)
      .post('/test/bugs')
      .set('X-Test-Session', a)
      .send({ enable: ['button-moves'] })
      .expect(200);
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'customer@playlab.test', password: 'Password123!' });
    const auth = `Bearer ${login.body.accessToken}`;
    await request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: 1 }).expect(201);

    const intent = await request(app).post('/api/v1/payments/intents').set('Authorization', auth).set('X-Test-Session', a).expect(201);
    const frameUrl = new URL(intent.body.data.frameUrl);
    expect(frameUrl.searchParams.get('testSession')).toBe(a);

    const withSession = await request(app).get(`/pay/frame${frameUrl.search}`).expect(200);
    expect(withSession.text).toContain('var BUGS = ["button-moves"]');
    const without = await request(app).get('/pay/frame').expect(200);
    expect(without.text).toContain('var BUGS = []');
  });
});

describe('live stock stream', () => {
  it("follows the watcher's session, whoever changes the stock", async () => {
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const [stale, fresh] = [await newSession(), await newSession()];
      await request(app)
        .post('/test/bugs')
        .set('X-Test-Session', stale)
        .send({ enable: ['stale-stock'] })
        .expect(200);
      const admin = await request(app).post('/test/users').send({ role: 'admin' }).expect(201);

      const watch = async (session: string) => {
        const controller = new AbortController();
        const res = await fetch(`${base}/api/v1/stock/stream?ids=6`, { headers: { 'X-Test-Session': session }, signal: controller.signal });
        const reader = res.body!.getReader();
        let text = '';
        const reading = (async () => {
          for (;;) {
            const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
            if (done) return;
            text += new TextDecoder().decode(value);
          }
        })();
        return { stop: () => (controller.abort(), reading), text: () => text };
      };
      const [staleStream, freshStream] = [await watch(stale), await watch(fresh)];
      await new Promise((r) => setTimeout(r, 200));

      // A request with no session changes the stock.
      await request(app)
        .patch('/api/v1/products/6')
        .set('Authorization', `Bearer ${admin.body.accessToken}`)
        .send({ stock: 2 })
        .expect(200);
      await new Promise((r) => setTimeout(r, 300));
      await Promise.all([staleStream.stop(), freshStream.stop()]);

      expect(freshStream.text()).toContain('event: stock');
      expect(staleStream.text()).toContain('event: snapshot');
      expect(staleStream.text()).not.toContain('event: stock');
    } finally {
      server.close();
    }
  });
});
