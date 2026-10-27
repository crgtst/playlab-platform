// PLS-27.2: POST /orders at 10 requests a second for 5 minutes. p95 under 800 ms, errors under 1%.
// Each iteration is one shopper: put a product in the cart (timed on its own), then order it (the timed request).
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { BASE_URL, authHeaders, figure, model } from '../lib/config.js';
import { generateCatalogue, newUser, perfProducts, shopperTokens } from '../lib/data.js';
import { summaryFor } from '../lib/summary.js';

const m = model.orders;

export const options = {
  scenarios: {
    orders: {
      executor: 'constant-arrival-rate',
      rate: Number(figure('RPS', m.rps)),
      timeUnit: '1s',
      duration: figure('DURATION', m.duration),
      preAllocatedVUs: 50,
      maxVUs: 300,
    },
  },
  thresholds: {
    'http_req_duration{endpoint:orders}': [`p(95)<${m.p95Ms}`],
    'http_req_failed{endpoint:orders}': [`rate<${m.maxErrorRate}`],
    'http_req_failed{endpoint:cart}': [`rate<${m.maxErrorRate}`],
    dropped_iterations: ['count<10'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const SHIPPING = { fullName: 'Load Test', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' };
const PAYMENT = { nameOnCard: 'Load Test', cardNumber: '4242424242424242', expiry: '12/30', cvc: '123' };
const deliveryDate = () => new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

export function setup() {
  generateCatalogue();
  const admin = newUser('admin');
  return { tokens: shopperTokens(model.data.users), productIds: perfProducts(admin) };
}

export default function (data) {
  const n = exec.scenario.iterationInTest;
  const headers = authHeaders(data.tokens[n % data.tokens.length]);
  const productId = data.productIds[n % data.productIds.length];

  const added = http.post(`${BASE_URL}/api/v1/cart/items`, JSON.stringify({ productId, quantity: 1 }), {
    headers,
    tags: { endpoint: 'cart', name: 'POST /cart/items' },
  });
  check(added, { 'cart: 201': (r) => r.status === 201 }, { endpoint: 'cart' });

  const placed = http.post(`${BASE_URL}/api/v1/orders`, JSON.stringify({ shipping: SHIPPING, deliveryDate: deliveryDate(), payment: PAYMENT }), {
    headers,
    tags: { endpoint: 'orders', name: 'POST /orders' },
  });
  check(placed, { 'order: 201': (r) => r.status === 201 }, { endpoint: 'orders' });
}

export const handleSummary = summaryFor({
  suite: 'orders',
  ac: m.ac,
  titles: {
    'http_req_duration{endpoint:orders}': `latency of POST /orders at ${figure('RPS', m.rps)}/s`,
    'http_req_failed{endpoint:orders}': 'error rate of POST /orders',
    'http_req_failed{endpoint:cart}': 'error rate of POST /cart/items',
    dropped_iterations: 'iterations k6 could not start',
  },
});
