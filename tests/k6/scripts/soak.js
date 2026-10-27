// PLS-27.3: steady load at half the PLS-27.1 rate for an hour. p95 in the last 5 minutes within 20% of the first 5 minutes, and the
// API stays inside its memory limit. k6 cannot compare two windows in a threshold, so the requests of each window are tagged, the
// summary compares them, and `run.sh soak` asks Prometheus for the API's memory afterwards (lib/soak-memory.mjs).
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { BASE_URL, figure, model, seconds } from '../lib/config.js';
import { generateCatalogue } from '../lib/data.js';
import { metricValue, summaryFor } from '../lib/summary.js';

const m = model.soak;
const durationSeconds = seconds(figure('DURATION', m.duration));
// A short run (for trying the script) uses a quarter of its length per window, so the two windows never overlap.
const windowSeconds = Math.min(seconds(figure('BASELINE_WINDOW', m.baselineWindow)), Math.floor(durationSeconds / 4));

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-arrival-rate',
      rate: Number(figure('RPS', m.rps)),
      timeUnit: '1s',
      duration: `${durationSeconds}s`,
      preAllocatedVUs: 30,
      maxVUs: 300,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    // These only make k6 report the two windows as their own metrics.
    'http_req_duration{window:first}': ['max>=0'],
    'http_req_duration{window:last}': ['max>=0'],
    dropped_iterations: ['count<10'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  generateCatalogue();
  return { start: Date.now() };
}

export default function (data) {
  const elapsed = (Date.now() - data.start) / 1000;
  const window = elapsed < windowSeconds ? 'first' : elapsed > durationSeconds - windowSeconds ? 'last' : 'middle';
  const res = http.get(`${BASE_URL}/api/v1/products?page=${1 + (exec.scenario.iterationInTest % 50)}&limit=12`, {
    tags: { window, name: 'GET /products' },
  });
  check(res, { 'status is 200': (r) => r.status === 200 });
}

export const handleSummary = summaryFor({
  suite: 'soak',
  ac: m.ac,
  titles: { http_req_failed: 'error rate over the soak', dropped_iterations: 'iterations k6 could not start' },
  extra: (data) => {
    const first = metricValue(data, 'http_req_duration{window:first}', 'p(95)');
    const last = metricValue(data, 'http_req_duration{window:last}', 'p(95)');
    if (first === undefined || last === undefined) return [{ name: 'p95 drift between the first and last windows', ok: false, message: 'a window has no requests' }];
    const drift = ((last - first) / first) * 100;
    return [
      {
        name: `p95 in the last ${windowSeconds}s is within ${m.maxDriftPercent}% of the first ${windowSeconds}s (first ${first.toFixed(1)} ms, last ${last.toFixed(1)} ms, ${drift.toFixed(1)}%)`,
        ok: drift <= m.maxDriftPercent,
        message: `p95 drifted ${drift.toFixed(1)}%`,
      },
    ];
  },
});
