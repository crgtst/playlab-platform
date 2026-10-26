import { discounts, product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';
import { cancelOrder, createOrder, getOrder } from '../../support/orders';
import { createHmac } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import type { TestUser } from '../../support/hooks';

const AUTH_URL = `${API_URL}/api/v1/auth`;
const ordersUrl = `${API_URL}/api/v1/orders`;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setBug(request: APIRequestContext, bug: string) {
  const response = await request.post(`${API_URL}/test/bugs`, { data: { enable: [bug] } });
  expect(response.status(), `Enable ${bug} defect mode`).toBe(200);
}

const base64url = (value: object | Buffer) => Buffer.from(Buffer.isBuffer(value) ? value : JSON.stringify(value)).toString('base64url');

/** The claims of a real access token, so a forged one differs from it only in how it is signed. */
function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function forge(claims: Record<string, unknown>, alg: 'none' | 'HS256', secret = ''): string {
  const unsigned = `${base64url({ alg, typ: 'JWT' })}.${base64url(claims)}`;
  return alg === 'none' ? `${unsigned}.` : `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

test.describe('PLS-24 API security', () => {
  test.describe('PLS-24.1 object level authorisation', () => {
    async function victimOrder(request: APIRequestContext, hooks: import('../../support/hooks').TestHooks) {
      const owner = await hooks.createUser('customer');
      const attacker = await hooks.createUser('customer');
      const admin = await hooks.createUser('admin');
      const order = await createOrder(request, owner, 'BK-002');
      return { owner, attacker, admin, order };
    }

    test("customer A cannot read, track or cancel customer B's order: 404", async ({ request, hooks }) => {
      const { attacker, admin, order } = await victimOrder(request, hooks);
      try {
        for (const call of [
          () => request.get(`${ordersUrl}/${order.id}`, { headers: bearer(attacker.accessToken) }),
          () => request.get(`${ordersUrl}/${order.id}/tracking`, { headers: bearer(attacker.accessToken) }),
          () => request.post(`${ordersUrl}/${order.id}/cancel`, { headers: bearer(attacker.accessToken) }),
        ]) {
          expect((await call()).status()).toBe(404);
        }
        expect((await getOrder(request, admin, order.id)).order.status).toBe('paid');
      } finally {
        await cancelOrder(request, admin, order);
      }
    });

    test("defect order-leak lets customer A read, track and cancel customer B's order", async ({ request, hooks }) => {
      await setBug(request, 'order-leak');
      const { attacker, admin, order } = await victimOrder(request, hooks);
      try {
        expect((await request.get(`${ordersUrl}/${order.id}`, { headers: bearer(attacker.accessToken) })).status()).toBe(200);
        expect((await request.get(`${ordersUrl}/${order.id}/tracking`, { headers: bearer(attacker.accessToken) })).status()).toBe(200);
        expect((await request.post(`${ordersUrl}/${order.id}/cancel`, { headers: bearer(attacker.accessToken) })).status()).toBe(200);
      } finally {
        // The attacker cancelled it, which already put the stock back.
        expect((await getOrder(request, admin, order.id)).order.status).toBe('cancelled');
      }
    });
  });

  test.describe('PLS-24.2 access tokens', () => {
    const me = (request: APIRequestContext, token: string) => request.get(`${AUTH_URL}/me`, { headers: bearer(token) });

    test('an unsigned token, a token signed with another key and an expired token are all refused with 401', async ({
      request,
      hooks,
      customer,
    }) => {
      const claims = claimsOf(customer.accessToken);
      expect((await me(request, customer.accessToken)).status(), 'The real token works').toBe(200);

      expect((await me(request, forge(claims, 'none'))).status(), 'alg: none').toBe(401);
      expect((await me(request, forge(claims, 'HS256', 'not-the-servers-secret'))).status(), 'another key').toBe(401);
      expect((await me(request, customer.accessToken.slice(0, -4) + 'AAAA')).status(), 'tampered signature').toBe(401);

      await hooks.advanceClock(16 * 60 * 1000);
      const expired = await me(request, customer.accessToken);
      expect(expired.status(), 'expired').toBe(401);
      expect(((await expired.json()) as { error: { code: string } }).error.code).toBe('TOKEN_EXPIRED');
    });

    test('defect token-never-expires accepts an expired token', async ({ request, hooks, customer }) => {
      await setBug(request, 'token-never-expires');
      await hooks.advanceClock(16 * 60 * 1000);
      expect((await me(request, customer.accessToken)).status()).toBe(200);
    });
  });

  test('PLS-24.3 a registered and an unknown email get identical responses for a failed login and a password-reset request', async ({
    request,
    customer,
  }) => {
    const unknown = `nobody-${Date.now()}@playlab.test`;
    const failedLogin = async (email: string) => {
      const response = await request.post(`${AUTH_URL}/login`, { data: { email, password: 'wrong-password' } });
      const { error } = (await response.json()) as { error: { code: string; message: string } };
      return { status: response.status(), code: error.code, message: error.message };
    };
    const reset = async (email: string) => {
      const response = await request.post(`${AUTH_URL}/forgot-password`, { data: { email } });
      return { status: response.status(), body: await response.json() };
    };

    expect(await failedLogin(customer.email)).toEqual(await failedLogin(unknown));
    expect(await reset(customer.email)).toEqual(await reset(unknown));
  });

  test('PLS-24.4 a registration body that includes "role": "admin" creates a customer account', async ({ request, hooks }) => {
    const admin = await hooks.createUser('admin');
    const email = `escalate-${Date.now()}-${Math.floor(Math.random() * 1000)}@playlab.test`;
    const registered = await request.post(`${AUTH_URL}/register`, {
      data: { name: 'Eve Escalate', email, password: 'Password123!', role: 'admin' },
    });
    expect(registered.status()).toBe(201);
    expect(((await registered.json()) as { user: { role: string } }).user.role).toBe('customer');

    const listed = await request.get(`${API_URL}/api/v1/admin/users?q=${encodeURIComponent(email)}`, {
      headers: bearer(admin.accessToken),
    });
    expect(((await listed.json()) as { data: { role: string }[] }).data.map((u) => u.role)).toEqual(['customer']);
  });

  test.describe('PLS-24.6 the rate limit', () => {
    // A guest's limit is per test session, so this test uses up its own and nobody else's.
    const request100 = async (request: APIRequestContext) => {
      for (let i = 0; i < 100; i++) expect((await request.get(`${API_URL}/api/v1/categories`)).status()).toBe(200);
    };
    const rotating = (request: APIRequestContext, n: number) =>
      request.get(`${API_URL}/api/v1/categories`, { headers: { 'X-Forwarded-For': `198.51.100.${n}` } });

    test('a guest who has used up the limit still gets 429 when the X-Forwarded-For header changes each time', async ({ request }) => {
      await request100(request);
      for (let n = 1; n <= 5; n++) {
        const response = await rotating(request, n);
        expect(response.status(), `X-Forwarded-For 198.51.100.${n}`).toBe(429);
        expect(((await response.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
      }
    });

    test('defect rate-limit-bypass gives each new X-Forwarded-For a fresh limit', async ({ request }) => {
      await setBug(request, 'rate-limit-bypass');
      await request100(request);
      expect((await rotating(request, 1)).status()).toBe(200);
      expect((await rotating(request, 2)).status()).toBe(200);
    });
  });

  test('PLS-24.7 a limit above the documented maximum is refused with 422 on products and orders', async ({ request, customer }) => {
    const products = await request.get(`${API_URL}/api/v1/products?limit=100000`);
    expect(products.status()).toBe(422);
    const orders = await request.get(`${ordersUrl}?limit=100000`, { headers: bearer(customer.accessToken) });
    expect(orders.status()).toBe(422);
  });

  test('PLS-24.8 a customer cannot change another user through PATCH /admin/users/{id}', async ({ request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const refused = await request.patch(`${API_URL}/api/v1/admin/users/${customer.id}`, {
      headers: bearer(customer.accessToken),
      data: { role: 'admin' },
    });
    expect(refused.status()).toBe(403);

    const listed = await request.get(`${API_URL}/api/v1/admin/users?q=${encodeURIComponent(customer.email)}`, {
      headers: bearer(admin.accessToken),
    });
    expect(((await listed.json()) as { data: { role: string }[] }).data.map((u) => u.role)).toEqual(['customer']);
  });

  test.describe('PLS-24.9 a single-use code used by two orders at the same moment', () => {
    // Both tests reset and use the one ONCE15 code, so they take turns.
    test.describe.configure({ mode: 'serial' });
    const code = discounts.fromFixtures.find((entry) => entry.fixture === 'single-use-discount')!.code;
    const sku = 'BK-003';

    async function raceForCode(request: APIRequestContext, hooks: import('../../support/hooks').TestHooks) {
      const seeded = await request.post(`${API_URL}/test/seed`, { data: { fixtures: ['single-use-discount'] } });
      expect(seeded.status()).toBe(201);
      const admin = await hooks.createUser('admin');
      const shoppers: TestUser[] = [await hooks.createUser('customer'), await hooks.createUser('customer')];
      for (const shopper of shoppers) {
        const headers = bearer(shopper.accessToken);
        await request.post(`${API_URL}/api/v1/cart/items`, { headers, data: { productId: product(sku).id, quantity: 1 } });
        const applied = await request.post(`${API_URL}/api/v1/cart/discount`, { headers, data: { code } });
        expect(applied.status(), `Apply ${code} to ${shopper.email}'s cart`).toBe(200);
      }
      const responses = await Promise.all(
        shoppers.map((shopper) =>
          request.post(ordersUrl, {
            headers: bearer(shopper.accessToken),
            data: {
              shipping: { fullName: 'Racer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' },
              deliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
              payment: { nameOnCard: 'Racer', cardNumber: '4242424242424242', expiry: '12/30', cvc: '123' },
            },
          }),
        ),
      );
      const placed = await Promise.all(
        responses
          .filter((r) => r.status() === 201)
          .map(async (r) => ((await r.json()) as { data: { id: number; number: string; discount: unknown } }).data),
      );
      return { admin, placed, discounted: placed.filter((order) => order.discount) };
    }

    test('only one order gets the discount', async ({ request, hooks }) => {
      const { admin, placed, discounted } = await raceForCode(request, hooks);
      try {
        expect(placed.length).toBeGreaterThan(0);
        expect(discounted).toHaveLength(1);
      } finally {
        for (const order of placed) await cancelOrder(request, admin, { ...order, status: 'paid', etag: '*' });
      }
    });

    test('defect single-use-reused gives both orders the discount', async ({ request, hooks }) => {
      await setBug(request, 'single-use-reused');
      const { admin, placed, discounted } = await raceForCode(request, hooks);
      try {
        expect(discounted).toHaveLength(2);
      } finally {
        for (const order of placed) await cancelOrder(request, admin, { ...order, status: 'paid', etag: '*' });
      }
    });
  });

  test('PLS-24.13 the retired /api/v0/orders route returns 404', async ({ request }) => {
    expect((await request.get(`${API_URL}/api/v0/orders`)).status()).toBe(404);
  });
});
