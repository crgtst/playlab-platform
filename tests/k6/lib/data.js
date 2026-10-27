// Data for a run, made through the API's test hooks (POST /test/generate, /test/users/bulk): nothing is loaded from a file.
import http from 'k6/http';
import { BASE_URL, JSON_HEADERS, authHeaders, model, mustBe } from './config.js';

const post = (path, body, headers = JSON_HEADERS, tags = {}) =>
  http.post(`${BASE_URL}${path}`, JSON.stringify(body), { headers, tags: { setup: 'true', ...tags } });

/** A throwaway user with this role, and its token. */
export function newUser(role) {
  const res = post('/test/users', { role });
  mustBe(res, 201, `POST /test/users (${role})`);
  return { token: res.json('accessToken'), id: res.json('user.id') };
}

/**
 * The catalogue: POST /test/generate is deterministic from its seed, so a second run finds the data already there (409) and
 * uses it. Reset first (POST /test/reset) for a clean start.
 */
export function generateCatalogue() {
  const { products, users, ordersPerUser, seed } = model.data;
  const res = post('/test/generate', { products, users, ordersPerUser, seed });
  if (res.status !== 201 && res.status !== 409) mustBe(res, 201, 'POST /test/generate');
}

/** `count` shoppers as tokens: the CSV (email, password, token) that POST /test/users/bulk returns. */
export function shopperTokens(count) {
  const res = post('/test/users/bulk', { count });
  mustBe(res, 201, 'POST /test/users/bulk');
  return res.body
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(',')[2]);
}

/** Products only this run orders, with so much stock that the orders never run out. */
export function perfProducts(admin) {
  const ids = [];
  const run = `${Date.now()}`;
  for (let i = 0; i < model.data.perfProducts; i++) {
    const res = post(
      '/api/v1/products',
      {
        sku: `PERF-${run}-${i}`,
        name: `zz Perf product ${run} ${i}`,
        description: 'Made by the k6 suite.',
        category: 'books',
        priceCents: 1000 + i,
        stock: model.data.perfProductStock,
      },
      authHeaders(admin.token),
    );
    mustBe(res, 201, 'POST /products');
    ids.push(res.json('data.id'));
  }
  return ids;
}

/** Slows every GET /products by `ms`, to show a threshold failing the build. teardown() takes it away. */
export function injectLatency(ms) {
  if (!ms) return;
  const res = post('/test/latency', { path: '/api/v1/products*', method: 'GET', delayMs: Number(ms) });
  mustBe(res, 201, 'POST /test/latency');
}

export function clearLatency() {
  http.del(`${BASE_URL}/test/latency`, null, { tags: { setup: 'true' } });
}
