import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, resetStack } from './app';

beforeEach(resetStack);

async function session(...defects: string[]): Promise<string> {
  const id = (await request(app).post('/test/sessions').expect(201)).body.id;
  if (defects.length) await request(app).post('/test/bugs').set('X-Test-Session', id).send({ enable: defects }).expect(200);
  return id;
}

const as = (id: string) => ({ 'X-Test-Session': id });

async function newUser(id: string, role = 'customer') {
  const res = await request(app).post('/test/users').set(as(id)).send({ role }).expect(201);
  return { ...res.body.user, token: res.body.accessToken as string };
}

const SHIPPING = { fullName: 'Casey Customer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' };
const CARD = { cardNumber: '4242 4242 4242 4242', expiry: '12/30', cvc: '123', nameOnCard: 'Casey Customer' };
const deliveryDate = () => new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

/** Puts one unit of a product in the user's cart and pays for it. */
async function order(id: string, user: { token: string }, extra: Record<string, unknown> = {}) {
  await request(app)
    .post('/api/v1/cart/items')
    .set(as(id))
    .set('Authorization', `Bearer ${user.token}`)
    .send({ productId: 1, quantity: 1 })
    .expect(201);
  return request(app)
    .post('/api/v1/orders')
    .set(as(id))
    .set('Authorization', `Bearer ${user.token}`)
    .send({ shipping: SHIPPING, deliveryDate: deliveryDate(), payment: CARD, ...extra });
}

describe('PLS-24.5 excessive-data-exposure', () => {
  async function twoCustomersOrderTheSame(id: string) {
    const [mine, theirs] = [await newUser(id), await newUser(id)];
    const first = await order(id, mine).then((r) => r.body.data);
    await order(id, theirs).then((r) => expect(r.status).toBe(201));
    return { mine, theirs, orderId: first.id as number };
  }

  it("shows a customer nothing of another customer's, in an order or the list", async () => {
    const id = await session();
    const { mine, theirs, orderId } = await twoCustomersOrderTheSame(id);
    const one = await request(app).get(`/api/v1/orders/${orderId}`).set(as(id)).set('Authorization', `Bearer ${mine.token}`).expect(200);
    const list = await request(app).get('/api/v1/orders').set(as(id)).set('Authorization', `Bearer ${mine.token}`).expect(200);
    expect(JSON.stringify([one.body, list.body])).not.toContain(theirs.email);
  });

  it("with the defect on, an order carries other buyers' names and emails", async () => {
    const id = await session('excessive-data-exposure');
    const { mine, theirs, orderId } = await twoCustomersOrderTheSame(id);
    const one = await request(app).get(`/api/v1/orders/${orderId}`).set(as(id)).set('Authorization', `Bearer ${mine.token}`).expect(200);
    expect(one.body.data.alsoOrderedBy.map((o: { email: string }) => o.email)).toContain(theirs.email);
    const list = await request(app).get('/api/v1/orders').set(as(id)).set('Authorization', `Bearer ${mine.token}`).expect(200);
    expect(JSON.stringify(list.body)).toContain(theirs.email);
  });

  it('shows an admin the orders as before, with the defect on', async () => {
    const id = await session('excessive-data-exposure');
    const admin = await newUser(id, 'admin');
    const res = await request(app).get('/api/v1/orders').set(as(id)).set('Authorization', `Bearer ${admin.token}`).expect(200);
    expect(JSON.stringify(res.body)).not.toContain('alsoOrderedBy');
  });
});

describe('PLS-24.7 no-page-limit', () => {
  it('refuses limit=100000 on products and orders', async () => {
    const id = await session();
    const user = await newUser(id);
    await request(app).get('/api/v1/products?limit=100000').set(as(id)).expect(422);
    await request(app).get('/api/v1/orders?limit=100000').set(as(id)).set('Authorization', `Bearer ${user.token}`).expect(422);
  });

  it('with the defect on, accepts it and returns everything', async () => {
    const id = await session('no-page-limit');
    const user = await newUser(id);
    const products = await request(app).get('/api/v1/products?limit=100000').set(as(id)).expect(200);
    expect(products.body.data.length).toBe(products.body.meta.total);
    expect(products.body.meta.limit).toBe(100000);
    await request(app).get('/api/v1/orders?limit=100000').set(as(id)).set('Authorization', `Bearer ${user.token}`).expect(200);
  });

  it('still refuses a limit of 0, with the defect on', async () => {
    const id = await session('no-page-limit');
    await request(app).get('/api/v1/products?limit=0').set(as(id)).expect(422);
  });
});

describe('PLS-24.13 shadow-api-v0', () => {
  it('is a 404 in the standard error shape', async () => {
    const id = await session();
    const res = await request(app).get('/api/v0/orders').set(as(id)).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('with the defect on, lists every order and email with no login', async () => {
    const id = await session('shadow-api-v0');
    const user = await newUser(id);
    await order(id, user).then((r) => expect(r.status).toBe(201));
    const res = await request(app).get('/api/v0/orders').set(as(id)).expect(200);
    expect(res.body.orders.map((o: { customerEmail: string }) => o.customerEmail)).toContain(user.email);
  });

  it('only brings back that one route', async () => {
    const id = await session('shadow-api-v0');
    await request(app).get('/api/v0/users').set(as(id)).expect(404);
  });
});

describe('PLS-24.14 trust-address-provider', () => {
  async function overflow(id: string) {
    const res = await request(app).get('/api/v1/addresses/suggest').query({ q: 'overflow' }).set(as(id)).expect(200);
    const [suggestion] = res.body.data;
    expect(suggestion.line1).toHaveLength(300);
    return suggestion;
  }
  const fromSuggestion = (s: { id: string; line1: string; city: string; postcode: string }) => ({
    shipping: { ...SHIPPING, line1: s.line1, city: s.city, postcode: s.postcode },
    addressSuggestionId: s.id,
  });

  it('validates a suggested address like a typed one: 422 on line1', async () => {
    const id = await session();
    const user = await newUser(id);
    const res = await order(id, user, fromSuggestion(await overflow(id)));
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain('shipping.line1');
  });

  it('with the defect on, believes the suggestion and stores the 300-character line', async () => {
    const id = await session('trust-address-provider');
    const user = await newUser(id);
    const res = await order(id, user, fromSuggestion(await overflow(id)));
    expect(res.status).toBe(201);
    expect(res.body.data.shipping.line1).toHaveLength(300);
  });

  it('still validates an address that was typed, with the defect on', async () => {
    const id = await session('trust-address-provider');
    const user = await newUser(id);
    const suggestion = await overflow(id);
    const res = await order(id, user, { shipping: { ...SHIPPING, line1: suggestion.line1 } });
    expect(res.status).toBe(422);
  });
});
