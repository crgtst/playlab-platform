// Smoke: one user walks the main read paths for half a minute. If this fails, do not bother with the load tests.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { BASE_URL, JSON_HEADERS, figure } from '../lib/config.js';
import { summaryFor } from '../lib/summary.js';

export const options = {
  vus: 1,
  duration: figure('DURATION', '30s'),
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<500'],
    checks: ['rate==1'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  group('browse', () => {
    check(http.get(`${BASE_URL}/api/v1/health`, { tags: { name: 'GET /health' } }), { 'health is 200': (r) => r.status === 200 });
    const list = http.get(`${BASE_URL}/api/v1/products?limit=12`, { tags: { name: 'GET /products' } });
    check(list, { 'list is 200': (r) => r.status === 200, 'list has products': (r) => r.json('data').length > 0 });
    const id = list.json('data.0.id');
    check(http.get(`${BASE_URL}/api/v1/products/${id}`, { tags: { name: 'GET /products/{id}' } }), { 'product is 200': (r) => r.status === 200 });
    check(http.get(`${BASE_URL}/api/v1/categories`, { tags: { name: 'GET /categories' } }), { 'categories is 200': (r) => r.status === 200 });
  });
  group('log in', () => {
    const login = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({ email: 'customer@playlab.test', password: 'Password123!' }), {
      headers: JSON_HEADERS,
      tags: { name: 'POST /auth/login' },
    });
    check(login, { 'login is 200': (r) => r.status === 200 });
  });
  sleep(1);
}

export const handleSummary = summaryFor({ suite: 'smoke', ac: 'Smoke' });
