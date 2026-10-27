// Stress: the rate climbs in steps until the API gives out, to find where. No AC and no pass mark beyond "it answers": read the
// p95 and error rate per step on the Grafana dashboard. The run stops early once more than 20% of requests fail.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, figure } from '../lib/config.js';
import { generateCatalogue } from '../lib/data.js';
import { summaryFor } from '../lib/summary.js';

const step = figure('STEP', '1m');
const rates = (figure('RATES', '50,100,200,400,800') + '').split(',').map(Number);

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: rates[0],
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 1500,
      stages: rates.flatMap((target) => [
        { target, duration: '10s' },
        { target, duration: step },
      ]),
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.2', abortOnFail: true, delayAbortEval: '30s' }],
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

export const handleSummary = summaryFor({ suite: 'stress', ac: 'Stress' });
