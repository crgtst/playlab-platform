import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, resetStack } from './app';

beforeEach(resetStack);

const HEADERS = ['x-content-type-options', 'referrer-policy', 'content-security-policy', 'permissions-policy'];

async function newSession(): Promise<string> {
  return (await request(app).post('/test/sessions').expect(201)).body.id;
}

async function enable(session: string, ...defects: string[]) {
  await request(app).post('/test/bugs').set('X-Test-Session', session).send({ enable: defects }).expect(200);
}

describe('PLS-24.11 security headers', () => {
  const routes: [string, () => request.Test][] = [
    ['a JSON read', () => request(app).get('/api/v1/products')],
    ['health', () => request(app).get('/api/v1/health')],
    ['an unknown route (404)', () => request(app).get('/api/v1/no-such-route')],
    ['a missing token (401)', () => request(app).get('/api/v1/orders')],
    ['a validation error (422)', () => request(app).post('/api/v1/auth/login').send({})],
    ['the OpenAPI file', () => request(app).get('/api/openapi.json')],
    ['the metrics', () => request(app).get('/metrics')],
    ['the docs page', () => request(app).get('/api/docs/')],
    ['the payment frame', () => request(app).get('/pay/frame')],
    ['a test hook', () => request(app).get('/test/clock')],
  ];

  it.each(routes)('is on %s', async (_name, send) => {
    const res = await send();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBeTruthy();
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['permissions-policy']).toBeTruthy();
  });

  it('gives the API a policy that allows nothing, and the pages only what they use', async () => {
    expect((await request(app).get('/api/v1/products')).headers['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect((await request(app).get('/api/docs/')).headers['content-security-policy']).toContain("script-src 'self' 'unsafe-inline'");
    const frame = (await request(app).get('/pay/frame')).headers['content-security-policy'];
    expect(frame).toContain("connect-src 'self'");
    expect(frame).toContain('frame-ancestors http://localhost:5173');
  });

  it('is gone with missing-security-headers on, in that session only', async () => {
    const [bare, normal] = [await newSession(), await newSession()];
    await enable(bare, 'missing-security-headers');
    const without = await request(app).get('/api/v1/products').set('X-Test-Session', bare);
    for (const header of HEADERS) expect(without.headers[header], header).toBeUndefined();
    const withHeaders = await request(app).get('/api/v1/products').set('X-Test-Session', normal);
    for (const header of HEADERS) expect(withHeaders.headers[header], header).toBeDefined();
  });
});

describe('PLS-24.12 error bodies', () => {
  const searchBroken = (session?: string) => {
    const req = request(app).get('/api/v1/products').query({ q: "O'Neill" });
    return session ? req.set('X-Test-Session', session) : req;
  };

  it('a 500 has only the standard fields: no stack, SQL or file path', async () => {
    const session = await newSession();
    await enable(session, 'search-apostrophe'); // a real unexpected error
    const res = await searchBroken(session).expect(500);
    expect(Object.keys(res.body.error)).toEqual(['code', 'message', 'details', 'correlationId']);
    expect(res.body.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Something went wrong', details: null });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/SELECT|ILIKE|\.ts:|\/app\/|node_modules|at .*\(/);
  });

  it('with verbose-errors on, the 500 shows the stack, the SQL and file paths', async () => {
    const session = await newSession();
    await enable(session, 'search-apostrophe', 'verbose-errors');
    const res = await searchBroken(session).expect(500);
    const { details } = res.body.error;
    expect(details.stack).toMatch(/\.ts:\d+/);
    expect(details.query).toContain('SELECT * FROM products');
    // The defect is per session: another session's 500 stays plain.
    const other = await newSession();
    await enable(other, 'search-apostrophe');
    expect((await searchBroken(other).expect(500)).body.error.details).toBeNull();
  });
});
