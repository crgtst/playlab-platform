import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { bugs } from '../src/lib/bugs';

// Only requests that are answered before any database query, so no Postgres is needed.

const testHooks = config.testHooks;

function appWithHooks(on: boolean) {
  config.testHooks = on;
  return createApp();
}

afterEach(() => {
  bugs.clear();
  config.testHooks = testHooks;
});

describe('HTTP basics', () => {
  const app = appWithHooks(false);

  it('returns the JSON error envelope for an unknown route', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No route for GET /api/v1/nope', details: null, correlationId: res.headers['x-correlation-id'] },
    });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('reports each missing field when there is no body', async () => {
    const res = await request(app).post('/api/v1/auth/login');
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(['email', 'password']);
  });

  it('parses nested query parameters, so they fail validation', async () => {
    const res = await request(app).get('/api/v1/products?category[x]=1');
    expect(res.status).toBe(422);
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
  });
});

describe('test hooks', () => {
  it('are not mounted when TEST_HOOKS is false', async () => {
    const res = await request(appWithHooks(false)).get('/test/bugs');
    expect(res.status).toBe(404);
  });

  it('switch a defect on and off', async () => {
    const app = appWithHooks(true);
    await request(app)
      .post('/test/bugs')
      .send({ enable: ['wrong-status-code'] })
      .expect(200);
    const invalid = await request(app).post('/api/v1/auth/login').send({});
    expect(invalid.status).toBe(500);

    await request(app).delete('/test/bugs').expect(204);
    const fixed = await request(app).post('/api/v1/auth/login').send({});
    expect(fixed.status).toBe(422);
  });
});
