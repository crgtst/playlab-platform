// Stress: the rate climbs in steps until the API gives out, to find where. No AC and no pass mark beyond "it answers": the
// summary prints the p95 and error rate of each step, and the capacity is the last step under the GET /products SLO.
// The run stops early once more than 20% of requests fail.
//
//   RATES=50,100,200,400,800 STEP=1m tests/k6/run.sh stress
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, figure, model, seconds } from '../lib/config.js';
import { generateCatalogue } from '../lib/data.js';
import { metricValue, summaryFor } from '../lib/summary.js';

const stepSeconds = seconds(figure('STEP', '1m'));
const rates = String(figure('RATES', '50,100,200,400,800')).split(',').map(Number);

// One scenario for each step, one after another, so each step has its own latency and error rate.
const scenarios = {};
const thresholds = { http_req_failed: [{ threshold: 'rate<0.2', abortOnFail: true, delayAbortEval: '30s' }] };
rates.forEach((rate, i) => {
  scenarios[`step_${rate}`] = {
    executor: 'constant-arrival-rate',
    rate,
    timeUnit: '1s',
    duration: `${stepSeconds}s`,
    startTime: `${i * stepSeconds}s`,
    preAllocatedVUs: Math.min(Math.max(50, rate), 500),
    maxVUs: 4000,
    tags: { step: String(rate) },
  };
  // These only make k6 report each step as its own metric.
  thresholds[`http_req_duration{step:${rate}}`] = ['max>=0'];
  thresholds[`http_req_failed{step:${rate}}`] = ['rate>=0'];
});

export const options = { scenarios, thresholds, summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'] };

export function setup() {
  generateCatalogue();
}

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/products?page=${1 + Math.floor(Math.random() * 50)}&limit=12`, { tags: { name: 'GET /products' } });
  check(res, { 'status is 200': (r) => r.status === 200 });
}

export const handleSummary = summaryFor({
  suite: 'stress',
  ac: 'Stress',
  lines: (data) => {
    const out = ['', '  step (req/s)   p95 (ms)   p99 (ms)   failed'];
    for (const rate of rates) {
      const p95 = metricValue(data, `http_req_duration{step:${rate}}`, 'p(95)');
      const p99 = metricValue(data, `http_req_duration{step:${rate}}`, 'p(99)');
      const failed = metricValue(data, `http_req_failed{step:${rate}}`, 'rate');
      out.push(p95 === undefined ? `  ${String(rate).padStart(12)}   not reached` : `  ${String(rate).padStart(12)}   ${p95.toFixed(1).padStart(8)}   ${p99.toFixed(1).padStart(8)}   ${(failed * 100).toFixed(2)}%`);
    }
    out.push(`  The GET /products SLO is ${model.products.p95Ms} ms.`);
    return out;
  },
});
