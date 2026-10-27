import path from 'path';
import { MatchersV3, PactV4 } from '@pact-foundation/pact';
import { describe, expect, it } from 'vitest';
import { api, ApiRequestError } from '../src/api/client';
import type { AppConfig, Cart, Category, ProductList, Product, User } from '../src/api/types';

/**
 * What the web app expects of the API (PLS-26.4). Each test runs the app's own `api()` helper against a Pact mock server, so
 * the contract records what the app really sends and reads. The pact file in `app/web/pacts/` is then verified against the real
 * API in `app/api/test/integration/pact.int.test.ts`; the `given(...)` names are provider states (`POST /test/provider-states`).
 *
 * Values that change (ids, dates, tokens) are matched by type; values the app branches on (stock, inStock, error codes) are exact.
 */
const { like, eachLike, integer, string, boolean, regex } = MatchersV3;
const isoDate = regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, '2026-02-09T00:00:00.000Z');

const pact = new PactV4({
  consumer: 'playlab-web',
  provider: 'playlab-api',
  dir: path.resolve(__dirname, '../pacts'),
  logLevel: 'warn',
});

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

const category = { slug: string('electronics'), name: string('Electronics') };
const product = {
  id: integer(6),
  sku: string('EL-006'),
  name: string('Retro Vinyl Turntable'),
  description: string('A turntable.'),
  category: like(category),
  priceCents: integer(14900),
  stock: integer(3),
  inStock: boolean(true),
  imageUrl: string('/img/electronics.svg'),
  images: eachLike(string('/img/electronics.svg')),
  createdAt: isoDate,
  updatedAt: isoDate,
};
const user = {
  id: integer(1),
  email: string('customer@playlab.test'),
  name: string('Casey Customer'),
  role: string('customer'),
  emailVerified: boolean(true),
  avatarUrl: like(null),
  createdAt: isoDate,
};
const totals = {
  subtotalCents: integer(0),
  discountCents: integer(0),
  vatCents: integer(0),
  deliveryCents: integer(0),
  totalCents: integer(0),
};
const cartBase = {
  discount: like(null),
  discounts: [],
  totals: like(totals),
  currency: string('EUR'),
  priceChanged: boolean(false),
  notices: [],
};
const errorBody = (code: string, message: string, details: unknown = null) => ({
  error: {
    code: string(code),
    message: string(message),
    details: like(details),
    correlationId: string('b3f5c7a0-0000-4000-8000-000000000000'),
  },
});

const url = (mock: { url: string }) => `${mock.url}/api/v1`;

describe('products', () => {
  it('lists the newest products for the home page', async () => {
    await pact
      .addInteraction()
      .given('the catalogue has products')
      .uponReceiving('a request for the four newest products')
      .withRequest('GET', '/api/v1/products', (r) => r.query({ sort: 'newest', limit: '4' }).headers({ Accept: 'application/json' }))
      .willRespondWith(200, (r) =>
        r.headers(JSON_HEADERS).jsonBody({
          data: eachLike(product),
          meta: { page: integer(1), limit: integer(4), total: integer(40), totalPages: integer(10), sort: string('newest') },
        }),
      )
      .executeTest(async (mock) => {
        const list = await api<ProductList>('/products?sort=newest&limit=4', { base: url(mock) });
        expect(list.data.length).toBeGreaterThan(0);
        expect(typeof list.data[0].priceCents).toBe('number');
        expect(list.meta.totalPages).toBeGreaterThan(0);
      });
  });

  it('shows a product with stock left', async () => {
    await pact
      .addInteraction()
      .given('product 6 has stock 3')
      .uponReceiving('a request for product 6, which has 3 left')
      .withRequest('GET', '/api/v1/products/6', (r) => r.headers({ Accept: 'application/json' }))
      .willRespondWith(200, (r) =>
        r
          .headers({ ...JSON_HEADERS, ETag: regex(/^"[^"]+"$/, '"fz_MdPlznJnLijBNFcdkYWZoBzE"') })
          .jsonBody({ data: { ...product, id: 6, stock: 3, inStock: true } }),
      )
      .executeTest(async (mock) => {
        let etag: string | null = null;
        const res = await api<{ data: Product }>('/products/6', { base: url(mock), onHeaders: (h) => (etag = h.get('ETag')) });
        expect(res.data).toMatchObject({ id: 6, stock: 3, inStock: true });
        expect(etag).toMatch(/^".+"$/);
      });
  });

  it('shows a product that is sold out', async () => {
    await pact
      .addInteraction()
      .given('product 6 is out of stock')
      .uponReceiving('a request for product 6, which is sold out')
      .withRequest('GET', '/api/v1/products/6', (r) => r.headers({ Accept: 'application/json' }))
      .willRespondWith(200, (r) => r.headers(JSON_HEADERS).jsonBody({ data: { ...product, id: 6, stock: 0, inStock: false } }))
      .executeTest(async (mock) => {
        const res = await api<{ data: Product }>('/products/6', { base: url(mock) });
        expect(res.data).toMatchObject({ stock: 0, inStock: false });
      });
  });

  it('gets a 404 with the usual error body for a product that does not exist', async () => {
    await pact
      .addInteraction()
      .given('the catalogue has products')
      .uponReceiving('a request for a product that does not exist')
      .withRequest('GET', '/api/v1/products/99999', (r) => r.headers({ Accept: 'application/json' }))
      .willRespondWith(404, (r) => r.headers(JSON_HEADERS).jsonBody(errorBody('NOT_FOUND', 'Product not found')))
      .executeTest(async (mock) => {
        const err = await api('/products/99999', { base: url(mock) }).catch((e) => e);
        expect(err).toBeInstanceOf(ApiRequestError);
        expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND' });
      });
  });

  it('lists the categories with their product counts', async () => {
    await pact
      .addInteraction()
      .given('the catalogue has products')
      .uponReceiving('a request for the categories')
      .withRequest('GET', '/api/v1/categories', (r) => r.headers({ Accept: 'application/json' }))
      .willRespondWith(200, (r) => r.headers(JSON_HEADERS).jsonBody({ data: eachLike({ ...category, productCount: integer(8) }) }))
      .executeTest(async (mock) => {
        const res = await api<{ data: Category[] }>('/categories', { base: url(mock) });
        expect(res.data[0]).toHaveProperty('slug');
        expect(typeof res.data[0].productCount).toBe('number');
      });
  });
});

describe('config', () => {
  it('reads the app config', async () => {
    await pact
      .addInteraction()
      .given('the catalogue has products')
      .uponReceiving('a request for the app config')
      .withRequest('GET', '/api/v1/config', (r) => r.headers({ Accept: 'application/json' }))
      .willRespondWith(200, (r) =>
        r.headers(JSON_HEADERS).jsonBody({
          paymentFrameUrl: string('http://localhost:3000/pay/frame'),
          testHooks: boolean(true),
          currencies: like({ EUR: 1, GBP: 0.85 }),
          bugs: [],
        }),
      )
      .executeTest(async (mock) => {
        const config = await api<AppConfig>('/config', { base: url(mock) });
        expect(config.currencies.EUR).toBe(1);
        expect(Array.isArray(config.bugs)).toBe(true);
      });
  });
});

describe('login', () => {
  const credentials = { email: 'customer@playlab.test', password: 'Password123!' };
  const state = 'a user with email customer@playlab.test exists';

  it('signs in with the right password', async () => {
    await pact
      .addInteraction()
      .given(state)
      .uponReceiving('a login with the right password')
      .withRequest('POST', '/api/v1/auth/login', (r) => r.headers({ 'Content-Type': 'application/json' }).jsonBody(credentials))
      .willRespondWith(200, (r) =>
        r
          .headers(JSON_HEADERS)
          .jsonBody({ user: like(user), accessToken: string('token'), expiresIn: integer(900), tokenType: string('Bearer') }),
      )
      .executeTest(async (mock) => {
        const res = await api<{ user: User }>('/auth/login', { base: url(mock), method: 'POST', body: credentials });
        expect(res.user).toMatchObject({ email: 'customer@playlab.test', role: 'customer' });
      });
  });

  it('is refused with 401 INVALID_CREDENTIALS for the wrong password', async () => {
    await pact
      .addInteraction()
      .given(state)
      .uponReceiving('a login with the wrong password')
      .withRequest('POST', '/api/v1/auth/login', (r) =>
        r.headers({ 'Content-Type': 'application/json' }).jsonBody({ ...credentials, password: 'not-the-password' }),
      )
      .willRespondWith(401, (r) => r.headers(JSON_HEADERS).jsonBody(errorBody('INVALID_CREDENTIALS', 'Email or password is incorrect')))
      .executeTest(async (mock) => {
        const err = await api('/auth/login', {
          base: url(mock),
          method: 'POST',
          body: { ...credentials, password: 'not-the-password' },
        }).catch((e) => e);
        expect(err).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
      });
  });

  it('gets field errors, which the form shows under each field, for an empty form', async () => {
    await pact
      .addInteraction()
      .given(state)
      .uponReceiving('a login with nothing filled in')
      .withRequest('POST', '/api/v1/auth/login', (r) =>
        r.headers({ 'Content-Type': 'application/json' }).jsonBody({ email: '', password: '' }),
      )
      .willRespondWith(422, (r) =>
        r.headers(JSON_HEADERS).jsonBody(
          errorBody('VALIDATION_ERROR', 'Validation failed', [
            { field: 'email', message: 'Email is required' },
            { field: 'password', message: 'Password is required' },
          ]),
        ),
      )
      .executeTest(async (mock) => {
        const err = (await api('/auth/login', { base: url(mock), method: 'POST', body: { email: '', password: '' } }).catch(
          (e) => e,
        )) as ApiRequestError;
        expect(err.status).toBe(422);
        expect(Object.keys(err.fieldErrors()).sort()).toEqual(['email', 'password']);
      });
  });
});

describe('cart', () => {
  // The Authorization value is a placeholder: the provider test swaps in a real token for a new user.
  const auth = { Authorization: 'Bearer valid-token', Accept: 'application/json' };

  it('shows an empty cart', async () => {
    await pact
      .addInteraction()
      .given('the catalogue has products')
      .uponReceiving('a request for the cart of a signed-in user with nothing in it')
      .withRequest('GET', '/api/v1/cart', (r) => r.headers(auth))
      .willRespondWith(200, (r) => r.headers(JSON_HEADERS).jsonBody({ ...cartBase, id: string(''), items: [], itemCount: integer(0) }))
      .executeTest(async (mock) => {
        const cart = await api<Cart>('/cart', { base: url(mock), headers: auth });
        expect(cart.items).toEqual([]);
        expect(cart.currency).toBe('EUR');
      });
  });

  it('adds a product and gets the cart back with its line total', async () => {
    await pact
      .addInteraction()
      .given('product 6 has stock 3')
      .uponReceiving('a request to add product 6 to the cart')
      .withRequest('POST', '/api/v1/cart/items', (r) =>
        r.headers({ ...auth, 'Content-Type': 'application/json' }).jsonBody({ productId: 6, quantity: 1 }),
      )
      .willRespondWith(201, (r) =>
        r.headers(JSON_HEADERS).jsonBody({
          ...cartBase,
          id: string('2a3aee83-aa8b-42c5-bf41-c57d6a747789'),
          itemCount: integer(1),
          items: eachLike({
            productId: integer(6),
            sku: string('EL-006'),
            name: string('Retro Vinyl Turntable'),
            imageUrl: string('/img/electronics.svg'),
            quantity: integer(1),
            stock: integer(3),
            unitPriceCents: integer(14900),
            priceAtAddCents: integer(14900),
            priceChanged: boolean(false),
            lineTotalCents: integer(14900),
          }),
        }),
      )
      .executeTest(async (mock) => {
        const cart = await api<Cart>('/cart/items', {
          base: url(mock),
          method: 'POST',
          body: { productId: 6, quantity: 1 },
          headers: auth,
        });
        expect(cart.items[0]).toMatchObject({ productId: 6, quantity: 1 });
        expect(cart.itemCount).toBe(1);
      });
  });
});
