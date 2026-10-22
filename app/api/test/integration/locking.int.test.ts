import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../src/db/pool';
import { app, resetStack } from './app';

let admin: string;

beforeEach(async () => {
  await resetStack();
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'admin@playlab.test', password: 'Password123!' }).expect(200);
  admin = `Bearer ${res.body.accessToken}`;
});

async function productEtag(id = 6): Promise<string> {
  return (await request(app).get(`/api/v1/products/${id}`).expect(200)).headers.etag;
}

function put(etag: string | null, body: Record<string, unknown> = { name: 'Retro Vinyl Turntable', stock: 3 }) {
  const req = request(app).patch('/api/v1/products/6').set('Authorization', admin);
  if (etag) req.set('If-Match', etag);
  return req.send(body);
}

async function fullProduct() {
  const { data } = (await request(app).get('/api/v1/products/6').expect(200)).body;
  return {
    sku: data.sku,
    name: data.name,
    description: data.description,
    category: data.category.slug,
    priceCents: data.priceCents,
    stock: data.stock,
  };
}

describe('PLS-21 products', () => {
  it('PLS-21.1 accepts an edit with the current ETag and returns a new one', async () => {
    const etag = await productEtag();
    const res = await put(etag, { name: 'Turntable Mk II' }).expect(200);
    expect(res.body.data.name).toBe('Turntable Mk II');
    expect(res.headers.etag).toBeDefined();
    expect(res.headers.etag).not.toBe(etag);
    expect(res.headers.etag).toBe(await productEtag());
  });

  it('PLS-21.1 works for PUT too', async () => {
    const res = await request(app)
      .put('/api/v1/products/6')
      .set('Authorization', admin)
      .set('If-Match', await productEtag())
      .send({ ...(await fullProduct()), name: 'Turntable (PUT)' })
      .expect(200);
    expect(res.body.data.name).toBe('Turntable (PUT)');
  });

  it("PLS-21.2 refuses a stale ETag with 412 and leaves the other admin's edit in place", async () => {
    const stale = await productEtag();
    await put(stale, { name: 'First admin wins' }).expect(200);
    const res = await put(stale, { name: 'Second admin loses' }).expect(412);
    expect(res.body.error.code).toBe('PRECONDITION_FAILED');
    expect((await request(app).get('/api/v1/products/6')).body.data.name).toBe('First admin wins');
  });

  it('PLS-21.3 requires If-Match with 428', async () => {
    const res = await request(app)
      .put('/api/v1/products/6')
      .set('Authorization', admin)
      .send(await fullProduct())
      .expect(428);
    expect(res.body.error.code).toBe('PRECONDITION_REQUIRED');
    await put(null).expect(428);
  });

  it('accepts If-Match: * as any current version', async () => {
    await put('*', { name: 'Any version' }).expect(200);
  });

  it('gives a new ETag when stock changes, so a stale edit cannot undo a sale', async () => {
    const etag = await productEtag();
    await query('UPDATE products SET stock = stock - 1 WHERE id = 6');
    await put(etag).expect(412);
  });
});

describe('PLS-21.4 the last item race', () => {
  async function racers(count: number) {
    await request(app)
      .post('/test/seed')
      .send({ fixtures: ['low-stock-product'] })
      .expect(201);
    const [{ id }] = await query<{ id: number }>("SELECT id FROM products WHERE sku = 'FX-LOW'");
    const tokens: string[] = [];
    for (let i = 0; i < count; i++) {
      const user = await request(app).post('/test/users').send({ role: 'customer' }).expect(201);
      const auth = `Bearer ${user.body.accessToken}`;
      await request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: id }).expect(201);
      tokens.push(auth);
    }
    const order = (auth: string) =>
      request(app)
        .post('/api/v1/orders')
        .set('Authorization', auth)
        .send({
          shipping: { fullName: 'Racer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' },
          deliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
          payment: { cardNumber: '4242 4242 4242 4242', expiry: '12/30', cvc: '123', nameOnCard: 'Racer' },
        });
    return (await Promise.all(tokens.map(order))).map((r) => r.status);
  }

  it('lets exactly 1 of 20 simultaneous orders buy the last item', async () => {
    const statuses = await racers(20);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
  });

  it('oversells with stock-oversell on', async () => {
    await request(app)
      .post('/test/bugs')
      .send({ enable: ['stock-oversell'] })
      .expect(200);
    const statuses = await racers(5);
    expect(statuses.filter((s) => s === 201).length).toBeGreaterThan(1);
  });
});

describe('PLS-21 orders', () => {
  let orderId: number;

  beforeEach(async () => {
    await request(app)
      .post('/test/seed')
      .send({ fixtures: ['orders-for-admin'] })
      .expect(201);
    [{ id: orderId }] = await query<{ id: number }>("SELECT id FROM orders WHERE status = 'paid' ORDER BY id LIMIT 1");
  });

  const getOrder = () => request(app).get(`/api/v1/orders/${orderId}`).set('Authorization', admin).expect(200);
  const patch = (etag: string | null, status = 'processing') => {
    const req = request(app).patch(`/api/v1/orders/${orderId}/status`).set('Authorization', admin);
    if (etag) req.set('If-Match', etag);
    return req.send({ status });
  };

  it('PLS-21.6 GET /orders/{id} has an ETag that changes with the status', async () => {
    const before = await getOrder();
    expect(before.headers.etag).toBe(before.body.data.etag);
    const res = await patch(before.headers.etag).expect(200);
    expect(res.headers.etag).not.toBe(before.headers.etag);
    expect((await getOrder()).headers.etag).toBe(res.headers.etag);
  });

  it('PLS-21.6 the order list carries the same ETag', async () => {
    const list = await request(app).get('/api/v1/orders?limit=100').set('Authorization', admin).expect(200);
    const listed = list.body.data.find((o: { id: number }) => o.id === orderId);
    expect(listed.etag).toBe((await getOrder()).headers.etag);
  });

  it('PLS-21.5 refuses a stale If-Match with 412 and a missing one with 428', async () => {
    const stale = (await getOrder()).headers.etag;
    await patch(stale, 'processing').expect(200);
    const refused = await patch(stale, 'shipped').expect(412);
    expect(refused.body.error.code).toBe('PRECONDITION_FAILED');
    await patch(null, 'shipped').expect(428);
    expect((await getOrder()).body.data.status).toBe('processing');
  });

  it('checks If-Match before the transition rules', async () => {
    await patch('"stale"', 'pending').expect(412);
  });
});

describe('defect lost-update', () => {
  it('accepts stale and missing If-Match when on, and only when on', async () => {
    const stale = await productEtag();
    await put(stale, { name: 'Newer edit' }).expect(200);
    await put(stale).expect(412);
    await put(null).expect(428);

    await request(app)
      .post('/test/bugs')
      .send({ enable: ['lost-update'] })
      .expect(200);
    await put(stale, { name: 'Stale edit wins' }).expect(200);
    await put(null, { name: 'No If-Match wins' }).expect(200);
    expect((await request(app).get('/api/v1/products/6')).body.data.name).toBe('No If-Match wins');
  });
});
