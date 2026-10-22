import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../src/db/pool';
import { ORDER_STATUSES, TRANSITIONS } from '../../src/routes/orders';
import { app, resetStack } from './app';

type Status = (typeof ORDER_STATUSES)[number];

let admin: string;
let customer: string;

async function token(email: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password123!' }).expect(200);
  return `Bearer ${res.body.accessToken}`;
}

beforeEach(async () => {
  await resetStack();
  await request(app)
    .post('/test/seed')
    .send({ fixtures: ['orders-for-admin'] })
    .expect(201);
  admin = await token('admin@playlab.test');
  customer = await token('customer@playlab.test');
});

/** A fixture order (Nora's or Liam's), put straight into the given status. */
async function orderIn(status: Status): Promise<number> {
  const [{ id }] = await query<{ id: number }>('SELECT id FROM orders ORDER BY id LIMIT 1');
  await query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
  return id;
}

async function statusOf(id: number): Promise<Status> {
  return (await query<{ status: Status }>('SELECT status FROM orders WHERE id = $1', [id]))[0].status;
}

/** Stock of each product in an order, keyed by product id. */
async function stockFor(orderId: number): Promise<Record<number, number>> {
  const rows = await query<{ id: number; stock: number }>(
    'SELECT p.id, p.stock FROM products p JOIN order_items oi ON oi.product_id = p.id WHERE oi.order_id = $1',
    [orderId],
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.stock]));
}

async function quantities(orderId: number): Promise<Record<number, number>> {
  const rows = await query<{ product_id: number; quantity: number }>('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [
    orderId,
  ]);
  return Object.fromEntries(rows.map((r) => [r.product_id, r.quantity]));
}

function patchStatus(id: number, status: Status) {
  return request(app).patch(`/api/v1/orders/${id}/status`).set('Authorization', admin).send({ status });
}

/** The customer's own new order, paid by card. */
async function customerOrder(): Promise<number> {
  await request(app).post('/api/v1/cart/items').set('Authorization', customer).send({ productId: 1, quantity: 2 }).expect(201);
  const res = await request(app)
    .post('/api/v1/orders')
    .set('Authorization', customer)
    .send({
      shipping: { fullName: 'Casey Customer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' },
      deliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
      payment: { cardNumber: '4242 4242 4242 4242', expiry: '12/30', cvc: '123', nameOnCard: 'Casey Customer' },
    })
    .expect(201);
  return res.body.data.id;
}

describe('PLS-20 admin status changes follow the transition map', () => {
  it('PLS-20.1 moves an order one step at a time from pending to delivered', async () => {
    const id = await orderIn('pending');
    for (const next of ['paid', 'processing', 'shipped', 'delivered'] as const) {
      const res = await patchStatus(id, next).expect(200);
      expect(res.body.data.status).toBe(next);
    }
  });

  it('PLS-20.2 refuses delivered back to pending with 409 and the allowed moves', async () => {
    const id = await orderIn('delivered');
    const res = await patchStatus(id, 'pending').expect(409);
    expect(res.body.error).toMatchObject({ code: 'INVALID_TRANSITION', details: { from: 'delivered', to: 'pending', allowed: [] } });
    expect(await statusOf(id)).toBe('delivered');
  });

  it('PLS-20.3 refuses to cancel a shipped order', async () => {
    const id = await orderIn('shipped');
    const res = await patchStatus(id, 'cancelled').expect(409);
    expect(res.body.error.details).toEqual({ from: 'shipped', to: 'cancelled', allowed: ['delivered'] });
  });

  // Every pair: allowed moves and no-op "changes" succeed, everything else is refused and leaves the order alone.
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      const allowed = from === to || TRANSITIONS[from].includes(to);
      it(`${from} → ${to} is ${allowed ? 'allowed' : 'refused'}`, async () => {
        const id = await orderIn(from);
        await patchStatus(id, to).expect(allowed ? 200 : 409);
        expect(await statusOf(id)).toBe(allowed ? to : from);
      });
    }
  }
});

describe('PLS-20.4 bulk changes are all or nothing', () => {
  it('changes nothing and lists every order that cannot make the move', async () => {
    const [paid, delivered, cancelled] = await query<{ id: number }>('SELECT id FROM orders ORDER BY id LIMIT 3');
    await query("UPDATE orders SET status = 'paid' WHERE id = $1", [paid.id]);
    await query("UPDATE orders SET status = 'delivered' WHERE id = $1", [delivered.id]);
    await query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [cancelled.id]);

    const res = await request(app)
      .post('/api/v1/orders/bulk-status')
      .set('Authorization', admin)
      .send({ ids: [paid.id, delivered.id, cancelled.id], status: 'processing' })
      .expect(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.details.orders.map((o: { id: number; from: string }) => [o.id, o.from])).toEqual([
      [delivered.id, 'delivered'],
      [cancelled.id, 'cancelled'],
    ]);
    expect(await statusOf(paid.id)).toBe('paid');
  });

  it('changes every order when all of them can make the move', async () => {
    const paid = await query<{ id: number }>("SELECT id FROM orders WHERE status = 'paid' ORDER BY id");
    const res = await request(app)
      .post('/api/v1/orders/bulk-status')
      .set('Authorization', admin)
      .send({ ids: paid.map((o) => o.id), status: 'processing' })
      .expect(200);
    expect(res.body.meta.updated).toBe(paid.length);
    for (const o of paid) expect(await statusOf(o.id)).toBe('processing');
  });
});

describe('PLS-20.5 cancelling restocks', () => {
  it('puts each item back in stock when an admin cancels a processing order', async () => {
    const id = await orderIn('processing');
    const [before, qty] = [await stockFor(id), await quantities(id)];
    await patchStatus(id, 'cancelled').expect(200);
    const after = await stockFor(id);
    for (const productId of Object.keys(qty)) expect(after[+productId]).toBe(before[+productId] + qty[+productId]);
  });

  it('restocks bulk cancellations, and never twice', async () => {
    const id = await orderIn('paid');
    const [before, qty] = [await stockFor(id), await quantities(id)];
    await request(app)
      .post('/api/v1/orders/bulk-status')
      .set('Authorization', admin)
      .send({ ids: [id], status: 'cancelled' })
      .expect(200);
    await request(app)
      .post('/api/v1/orders/bulk-status')
      .set('Authorization', admin)
      .send({ ids: [id], status: 'cancelled' })
      .expect(200);
    const after = await stockFor(id);
    for (const productId of Object.keys(qty)) expect(after[+productId]).toBe(before[+productId] + qty[+productId]);
  });
});

describe('PLS-20.6 customers cancel their own order', () => {
  it('cancels a paid order and restocks it', async () => {
    const id = await customerOrder();
    const [{ stock: before }] = await query<{ stock: number }>('SELECT stock FROM products WHERE id = 1');
    const res = await request(app).post(`/api/v1/orders/${id}/cancel`).set('Authorization', customer).expect(200);
    expect(res.body.data.status).toBe('cancelled');
    const [{ stock: after }] = await query<{ stock: number }>('SELECT stock FROM products WHERE id = 1');
    expect(after).toBe(before + 2);
  });

  it('refuses once the order is being packed', async () => {
    const id = await customerOrder();
    await patchStatus(id, 'processing').expect(200);
    const res = await request(app).post(`/api/v1/orders/${id}/cancel`).set('Authorization', customer).expect(409);
    expect(res.body.error.details).toEqual({ from: 'processing', to: 'cancelled', allowed: [] });
  });

  it("PLS-24.1 returns 404 for another customer's order", async () => {
    const [{ id }] = await query<{ id: number }>('SELECT id FROM orders ORDER BY id LIMIT 1');
    await query("UPDATE orders SET status = 'paid' WHERE id = $1", [id]);
    await request(app).post(`/api/v1/orders/${id}/cancel`).set('Authorization', customer).expect(404);
    expect(await statusOf(id)).toBe('paid');
  });
});

describe('defect status-any-transition', () => {
  it('lets refused moves through when on, and only when on', async () => {
    const id = await orderIn('delivered');
    await patchStatus(id, 'pending').expect(409);
    await request(app)
      .post('/test/bugs')
      .send({ enable: ['status-any-transition'] })
      .expect(200);
    await patchStatus(id, 'pending').expect(200);
    expect(await statusOf(id)).toBe('pending');
  });

  it('lets a mixed bulk change through when on', async () => {
    await request(app)
      .post('/test/bugs')
      .send({ enable: ['status-any-transition'] })
      .expect(200);
    const all = await query<{ id: number }>('SELECT id FROM orders');
    await request(app)
      .post('/api/v1/orders/bulk-status')
      .set('Authorization', admin)
      .send({ ids: all.map((o) => o.id), status: 'pending' })
      .expect(200);
  });
});
