// Spike: a quiet minute, a sudden surge for 30 seconds, then quiet again. The p95 after the spike must be back under the
// GET /products SLO: the API recovers on its own. No AC.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, figure, model } from '../lib/config.js';
import { generateCatalogue } from '../lib/data.js';
import { summaryFor } from '../lib/summary.js';

const quiet = 20;
const surge = Number(figure('SURGE', 300));

const scenario = (startTime, rate, duration, phase) => ({
  executor: 'constant-arrival-rate',
  rate,
  timeUnit: '1s',
  duration,
  startTime,
  preAllocatedVUs: 50,
  maxVUs: 1500,
  tags: { phase },
});

export const options = {
  scenarios: {
    before: scenario('0s', quiet, '30s', 'before'),
    surge: scenario('30s', surge, '30s', 'surge'),
    after: scenario('60s', quiet, '90s', 'after'),
  },
  thresholds: {
    'http_req_duration{phase:before}': [`p(95)<${model.products.p95Ms}`],
    'http_req_duration{phase:surge}': ['max>=0'],
    'http_req_duration{phase:after}': [`p(95)<${model.products.p95Ms}`],
    'http_req_failed{phase:after}': ['rate==0'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  generateCatalogue();
}

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/products?page=${1 + Math.floor(Math.random() * 50)}&limit=12`, { tags: { name: 'GET /products' } });
  check(res, { 'status is 200': (r) => r.status === 200 });
}

export const handleSummary = summaryFor({ suite: 'spike', ac: 'Spike' });
