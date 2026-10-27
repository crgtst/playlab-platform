// PLS-27.1: GET /products at 50 requests a second for 5 minutes. p95 under 200 ms, errors under 1%.
//
//   INJECT_LATENCY_MS=300 ./run.sh products     # slows GET /products: the p95 threshold fails and so does the run
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, figure, model } from '../lib/config.js';
import { clearLatency, generateCatalogue, injectLatency } from '../lib/data.js';
import { summaryFor } from '../lib/summary.js';

const m = model.products;

export const options = {
  scenarios: {
    products: {
      executor: 'constant-arrival-rate',
      rate: Number(figure('RPS', m.rps)),
      timeUnit: '1s',
      duration: figure('DURATION', m.duration),
      preAllocatedVUs: 50,
      maxVUs: 400,
    },
  },
  thresholds: {
    'http_req_duration{endpoint:products}': [`p(95)<${m.p95Ms}`],
    'http_req_failed{endpoint:products}': [`rate<${m.maxErrorRate}`],
    // If k6 could not send the requests it was asked to, the result says nothing about the API.
    dropped_iterations: ['count<10'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const SORTS = ['name_asc', 'price_asc', 'price_desc', 'newest'];
const CATEGORIES = ['', '', 'books', 'electronics', 'sports'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function setup() {
  generateCatalogue();
  injectLatency(__ENV.INJECT_LATENCY_MS);
}

export default function () {
  const category = pick(CATEGORIES);
  const url = `${BASE_URL}/api/v1/products?page=${1 + Math.floor(Math.random() * 50)}&limit=12&sort=${pick(SORTS)}${category ? `&category=${category}` : ''}`;
  const res = http.get(url, { tags: { endpoint: 'products', name: 'GET /products' } });
  check(res, { 'status is 200': (r) => r.status === 200 }, { endpoint: 'products' });
}

export function teardown() {
  clearLatency();
}

export const handleSummary = summaryFor({
  suite: 'products',
  ac: m.ac,
  titles: {
    'http_req_duration{endpoint:products}': `latency of GET /products at ${figure('RPS', m.rps)}/s`,
    'http_req_failed{endpoint:products}': 'error rate of GET /products',
    dropped_iterations: 'iterations k6 could not start',
  },
});
