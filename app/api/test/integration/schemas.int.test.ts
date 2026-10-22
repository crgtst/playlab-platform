import fs from 'node:fs';
import path from 'node:path';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import request from 'supertest';
import { beforeAll, expect, it } from 'vitest';
import { readOpenApi, SCHEMAS_DIR, toJsonSchema } from '../../scripts/export-schemas';
import { app, resetStack } from './app';

// The suites validate responses against tests/shared/schemas/, so those schemas (and the OpenAPI file they come from)
// must describe what the API really returns. This walks a journey through the API and checks every response: its status
// is one the OpenAPI file documents for that operation, and its JSON body matches the documented schema.

const shared = (file: string) => JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, '..', file), 'utf8'));
const accounts = shared('accounts.json');
const cards = shared('cards.json');

interface DocumentedResponse {
  $ref?: string;
  content?: Record<string, { schema?: unknown }>;
}
interface OpenApi {
  paths: Record<string, Record<string, { responses?: Record<string, DocumentedResponse> }>>;
  components: { responses: Record<string, DocumentedResponse> };
}
const openapi = readOpenApi() as unknown as OpenApi;
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
for (const file of fs.readdirSync(SCHEMAS_DIR)) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, file), 'utf8')), file);

/** The documented path for a real one: exact paths first, so /orders/export.csv isn't taken for /orders/{id}. */
function documentedPath(realPath: string): string {
  const p = realPath.replace(/^\/api\/v1/, '').split('?')[0];
  const paths = Object.keys(openapi.paths);
  if (paths.includes(p)) return p;
  const match = paths.find((t) => new RegExp(`^${t.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(p));
  if (!match) throw new Error(`No documented path for ${realPath}`);
  return match;
}

const validators = new Map<string, ValidateFunction | null>();
function validatorFor(method: string, template: string, status: number): ValidateFunction | null | undefined {
  const key = `${method} ${template} ${status}`;
  if (validators.has(key)) return validators.get(key);
  let response = openapi.paths[template]?.[method.toLowerCase()]?.responses?.[status];
  if (!response) return undefined;
  if (response.$ref) response = openapi.components.responses[response.$ref.split('/').pop()!];
  const schema = response.content?.['application/json']?.schema;
  const validate = schema ? ajv.compile(toJsonSchema(schema) as object) : null;
  validators.set(key, validate);
  return validate;
}

const checked: string[] = [];

async function call(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  opts: { token?: string; body?: object; headers?: Record<string, string> } = {},
) {
  let req = request(app)[method.toLowerCase() as 'get'](url);
  if (opts.token) req = req.set('Authorization', `Bearer ${opts.token}`);
  for (const [k, v] of Object.entries(opts.headers ?? {})) req = req.set(k, v);
  const res = await (opts.body ? req.send(opts.body) : req);
  const template = documentedPath(url);
  const validate = validatorFor(method, template, res.status);
  const label = `${method} ${template} -> ${res.status}`;
  expect(validate, `${label} is not a documented response. Body: ${JSON.stringify(res.body)}`).not.toBeUndefined();
  if (validate && res.headers['content-type']?.includes('json')) {
    expect(validate(res.body), `${label}: ${ajv.errorsText(validate.errors)}. Body: ${JSON.stringify(res.body).slice(0, 500)}`).toBe(true);
  }
  checked.push(label);
  return res;
}

const login = async (who: 'customer' | 'admin') =>
  (await call('POST', '/api/v1/auth/login', { body: { email: accounts[who].email, password: accounts[who].password } })).body;

beforeAll(resetStack);

it('every response in a journey through the API matches its documented status and schema', async () => {
  // Health, config and test hooks
  await call('GET', '/api/v1/health/live');
  await call('GET', '/api/v1/config');
  await call('GET', '/test');
  const session = await call('POST', '/test/sessions');
  await call('GET', '/test/clock');
  await call('POST', '/test/clock', { body: { advanceMs: 1000 } });
  await call('POST', '/test/clock', { body: { now: 'yesterday' } });
  await call('POST', '/test/seed', { body: { fixtures: ['product-with-reviews', 'orders-for-admin'] } });
  await call('POST', '/test/seed', { body: { fixtures: ['nope'] } });
  const testUser = await call('POST', '/test/users', { body: { role: 'customer' } });
  await call('GET', '/test/bugs');
  await call('POST', '/test/bugs', { body: { enable: ['sql-injection-search'] } });
  await call('DELETE', '/test/bugs');
  await call('GET', '/test/latency');
  await call('POST', '/test/latency', { body: { path: '/api/v1/nothing*', delayMs: 1 } });
  await call('DELETE', '/test/latency');
  await call('GET', '/test/chaos');
  await call('POST', '/test/chaos', { body: { path: '/api/v1/nothing*', failNext: 1 } });
  await call('DELETE', '/test/chaos');
  await call('GET', `/test/logs?correlationId=${session.headers['x-correlation-id']}`);

  // Accounts
  const email = 'schema-check@playlab.test';
  await call('POST', '/api/v1/auth/register', { body: { name: 'Schema Check', email, password: 'Password123!' } });
  await call('POST', '/api/v1/auth/register', { body: { name: 'Schema Check', email, password: 'Password123!' } });
  await call('POST', '/api/v1/auth/register', { body: {} });
  await call('GET', `/test/mailbox/${email}`);
  await call('POST', '/api/v1/auth/confirm-email', { body: { token: 'not-a-token' } });
  await call('POST', '/api/v1/auth/login', { body: { email: accounts.customer.email, password: 'wrong' } });
  const customer = await login('customer');
  const admin = await login('admin');
  const c = customer.accessToken;
  const a = admin.accessToken;
  await call('POST', '/api/v1/auth/refresh', { body: { refreshToken: customer.refreshToken } });
  await call('GET', '/api/v1/auth/me', { token: c });
  await call('GET', '/api/v1/auth/me');
  await call('POST', '/api/v1/auth/forgot-password', { body: { email: accounts.customer.email } });
  await call('POST', '/api/v1/auth/reset-password', { body: { token: 'nope', password: 'Password123!' } });
  await call('GET', '/api/v1/users/me', { token: c });
  await call('PATCH', '/api/v1/users/me', { token: c, body: { name: 'Casey C' } });

  // Catalogue
  await call('GET', '/api/v1/products?q=ear&sort=price_asc&limit=5');
  await call('GET', '/api/v1/products?page=0');
  await call('GET', '/api/v1/products/1');
  await call('GET', '/api/v1/products/9999');
  await call('GET', '/api/v1/categories');
  await call('GET', '/api/v1/products/1/reviews');
  await call('GET', '/api/v1/offers');
  await call('GET', '/api/v1/stores?q=dublin');
  await call('GET', '/api/v1/stores/nearest?lat=53.3&lng=-6.2');
  await call('GET', '/api/v1/addresses/suggest?q=main');

  // Wishlist
  await call('POST', '/api/v1/wishlist/items', { token: c, body: { productId: 2 } });
  await call('POST', '/api/v1/wishlist/items', { token: c, body: { productId: 3 } });
  await call('GET', '/api/v1/wishlist', { token: c });
  await call('PUT', '/api/v1/wishlist/order', { token: c, body: { productIds: [3, 2] } });
  await call('DELETE', '/api/v1/wishlist/items/3', { token: c });

  // Cart and checkout
  await call('GET', '/api/v1/cart', { token: c });
  await call('POST', '/api/v1/cart/items', { token: c, body: { productId: 1, quantity: 1 } });
  await call('POST', '/api/v1/cart/items', { token: c, body: { productId: 2, quantity: 1 } });
  await call('POST', '/api/v1/cart/items', { token: c, body: { productId: 1, quantity: 0 } });
  await call('PATCH', '/api/v1/cart/items/1', { token: c, body: { quantity: 2 } });
  await call('DELETE', '/api/v1/cart/items/2', { token: c });
  await call('POST', '/api/v1/cart/discount', { token: c, body: { code: 'SAVE10' } });
  await call('DELETE', '/api/v1/cart/discount', { token: c });
  const intent = await call('POST', '/api/v1/payments/intents', { token: c });
  await call('GET', `/api/v1/payments/intents/${intent.body.data.id}`, { token: c });
  await call('GET', `/pay/intents/${intent.body.data.id}?secret=${intent.body.data.clientSecret}`);
  const deliveryDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const shipping = { fullName: 'Casey Customer', line1: '1 Main St', city: 'Dublin', postcode: 'D01 F5P2' };
  const payment = (number: string) => ({ ...cards.defaults, cardNumber: number });
  await call('POST', '/api/v1/orders', { token: c, body: { shipping, deliveryDate, payment: payment(cards.decline.number) } });
  const order = await call('POST', '/api/v1/orders', {
    token: c,
    body: { shipping, deliveryDate, payment: payment(cards.success.number) },
  });
  await call('POST', '/api/v1/orders', { token: c, body: { shipping, deliveryDate, payment: payment(cards.success.number) } });
  const id = order.body.data.id;
  await call('GET', '/api/v1/orders', { token: c });
  await call('GET', `/api/v1/orders/${id}`, { token: c });
  await call('GET', `/api/v1/orders/${id}/tracking`, { token: c });
  await call('POST', `/api/v1/orders/${id}/cancel`, { token: c });
  await call('POST', `/api/v1/orders/${id}/cancel`, { token: c });

  // Admin
  await call('GET', '/api/v1/admin/users?role=customer', { token: a });
  await call('GET', '/api/v1/admin/users', { token: c });
  await call('PATCH', `/api/v1/admin/users/${testUser.body.user.id}`, { token: a, body: { role: 'support' } });
  const paid = (await call('GET', '/api/v1/orders?status=paid', { token: a })).body.data;
  await call('PATCH', `/api/v1/orders/${paid[0].id}/status`, { token: a, headers: { 'If-Match': '*' }, body: { status: 'processing' } });
  await call('PATCH', `/api/v1/orders/${paid[1].id}/status`, { token: a, body: { status: 'processing' } });
  await call('PATCH', `/api/v1/orders/${paid[1].id}/status`, { token: a, headers: { 'If-Match': '*' }, body: { status: 'delivered' } });
  await call('POST', '/api/v1/orders/bulk-status', { token: a, body: { ids: [paid[1].id, paid[2].id], status: 'processing' } });
  const product = await call('POST', '/api/v1/products', {
    token: a,
    body: { sku: 'SC-1', name: 'Schema Check', category: 'books', priceCents: 100, stock: 1 },
  });
  await call('PATCH', `/api/v1/products/${product.body.data.id}`, { token: a, headers: { 'If-Match': '*' }, body: { stock: 2 } });
  await call('PATCH', `/api/v1/products/${product.body.data.id}`, { token: a, headers: { 'If-Match': '"stale"' }, body: { stock: 3 } });
  await call('DELETE', `/api/v1/products/${product.body.data.id}`, { token: a });

  // Errors on the way out
  await call('POST', '/api/v1/auth/logout', { token: c });
  await call('DELETE', '/api/v1/users/me', { token: (await login('customer')).accessToken });

  expect(checked.length).toBeGreaterThan(80);
});
