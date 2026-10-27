// PLS-27.4: load well beyond capacity. The API must answer with 429 (or 503) and Retry-After, not time out, and answer normally
// again within a minute of the load dropping.
//
// Capacity here is the rate limit, so this needs the stack started with it on, low enough to reach:
//   PERF_RATE_LIMIT_PER_MIN=600 docker compose -f docker-compose.yml -f docker-compose.perf.yml up -d
// (the perf profile switches it off for the other tests). The limit is per client and per minute, and k6 is one client.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { BASE_URL, figure, model, seconds } from '../lib/config.js';
import { summaryFor } from '../lib/summary.js';

const m = model.overload;
const overloadFor = figure('OVERLOAD_DURATION', m.overloadDuration);
const recovery = Number(figure('RECOVERY_SECONDS', m.recoverySeconds));

const refused = new Counter('overload_refused'); // 429 or 503
const unexpected = new Rate('overload_unexpected'); // anything that is not 200, 429 or 503
const retryAfter = new Rate('overload_retry_after'); // of the refusals: did they say when to come back

export const options = {
  scenarios: {
    overload: {
      executor: 'constant-arrival-rate',
      rate: Number(figure('RPS', m.overloadRps)),
      timeUnit: '1s',
      duration: overloadFor,
      preAllocatedVUs: 100,
      maxVUs: 600,
      tags: { phase: 'overload' },
      exec: 'overload',
    },
    // The load drops to a trickle. For the first minute a refusal is allowed; after it, none is.
    recovering: {
      executor: 'constant-arrival-rate',
      rate: m.recoveryRps,
      timeUnit: '1s',
      duration: `${recovery}s`,
      startTime: overloadFor,
      preAllocatedVUs: 5,
      tags: { phase: 'recovering' },
      exec: 'recovering',
    },
    recovered: {
      executor: 'constant-arrival-rate',
      rate: m.recoveryRps,
      timeUnit: '1s',
      duration: '30s',
      startTime: `${seconds(overloadFor) + recovery}s`,
      preAllocatedVUs: 5,
      tags: { phase: 'recovered' },
      exec: 'recovered',
    },
  },
  thresholds: {
    overload_refused: ['count>0'], // it really was overloaded
    overload_unexpected: ['rate==0'], // no 5xx, no timeout
    overload_retry_after: ['rate==1'],
    'http_req_duration{phase:overload}': ['p(99)<1000'], // refused fast, not after a wait
    'http_req_failed{phase:recovered}': ['rate==0'],
    'http_req_duration{phase:recovered}': ['p(95)<500'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  const res = http.get(`${BASE_URL}/api/v1/products?limit=1`);
  // k6 may change a header name's case, so look for it ignoring case.
  const header = Object.keys(res.headers).find((name) => name.toLowerCase() === 'ratelimit');
  const limit = /limit=(\d+)/.exec((header && res.headers[header]) || '');
  if (!limit || Number(limit[1]) === 0 || Number(limit[1]) > 5000) {
    throw new Error(`The API's rate limit is ${limit ? limit[1] : 'off'}: restart the stack with PERF_RATE_LIMIT_PER_MIN=${m.limitPerMin} (see the top of this script)`);
  }
}

const read = () => http.get(`${BASE_URL}/api/v1/products?limit=12`, { tags: { name: 'GET /products' }, responseCallback: http.expectedStatuses(200, 429, 503) });

export function overload() {
  const res = read();
  const refusal = res.status === 429 || res.status === 503;
  if (refusal) {
    refused.add(1);
    retryAfter.add(Object.keys(res.headers).some((name) => name.toLowerCase() === 'retry-after'));
  }
  unexpected.add(res.status !== 200 && !refusal);
}

export function recovering() {
  read();
}

export function recovered() {
  // Default expected statuses here: a 429 now counts as a failed request, and the threshold above requires none.
  const res = http.get(`${BASE_URL}/api/v1/products?limit=12`, { tags: { name: 'GET /products' } });
  check(res, { 'back to 200': (r) => r.status === 200 });
}

export const handleSummary = summaryFor({
  suite: 'overload',
  ac: m.ac,
  titles: {
    overload_refused: 'requests refused with 429 or 503',
    overload_unexpected: 'share of responses that were not 200, 429 or 503 (errors and timeouts)',
    overload_retry_after: 'share of refusals with a Retry-After header',
    'http_req_duration{phase:overload}': 'latency while overloaded (a refusal is quick)',
    'http_req_failed{phase:recovered}': 'failures after the minute of recovery',
    'http_req_duration{phase:recovered}': 'latency after the minute of recovery',
  },
});
