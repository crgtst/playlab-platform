import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../src/db/pool';
import { app, resetStack } from './app';

beforeEach(resetStack);

const state = (body: object) => request(app).post('/test/provider-states').send(body);
const stock = async (id: number) => (await query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [id]))[0].stock;

describe('POST /test/provider-states', () => {
  it('PLS-26.5 sets a product\'s stock from "product 6 has stock 3"', async () => {
    await state({ state: 'product 6 has stock 9' }).expect(200);
    expect(await stock(6)).toBe(9);
    const res = await state({ state: 'product 6 has stock 3' }).expect(200);
    expect(res.body.data).toEqual([{ state: 'product 6 has stock 3', result: { productId: 6, sku: expect.any(String), stock: 3 } }]);
    expect(await stock(6)).toBe(3);
    const api = await request(app).get('/api/v1/products/6').expect(200);
    expect(api.body.data.stock).toBe(3);
  });

  it('PLS-26.5 sets stock to 0 for "product 6 is out of stock"', async () => {
    await state({ state: 'product 6 is out of stock' }).expect(200);
    expect(await stock(6)).toBe(0);
  });

  it('PLS-26.5 ignores case and extra spaces', async () => {
    await state({ state: '  Product  6 HAS stock 9 ' }).expect(200);
    expect(await stock(6)).toBe(9);
  });

  it('PLS-26.5 accepts what Pact sends: state or states, with the consumer and params alongside', async () => {
    await state({ consumer: 'web', state: 'product 7 has stock 2', params: {}, action: 'setup' }).expect(200);
    const res = await state({ states: ['product 8 has stock 4', 'product 9 has stock 5'] }).expect(200);
    expect(res.body.data).toHaveLength(2);
    expect([await stock(7), await stock(8), await stock(9)]).toEqual([2, 4, 5]);
  });

  it('PLS-26.5 creates a customer and an admin who can log in', async () => {
    for (const [name, role] of [
      ['a customer exists', 'customer'],
      ['an admin exists', 'admin'],
    ]) {
      const res = await state({ state: name }).expect(200);
      const { email, password } = res.body.data[0].result;
      expect(res.body.data[0].result.role).toBe(role);
      await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
    }
  });

  it('PLS-26.5 runs any fixture by name', async () => {
    const res = await state({ state: 'fixture customer-with-orders' }).expect(200);
    expect(res.body.data[0].result.orders).toHaveLength(3);
    await state({ state: 'fixture no-such-fixture' }).expect(404);
  });

  it('PLS-26.5 returns 404 PROVIDER_STATE_UNKNOWN for an unknown state, lists the known ones and changes nothing', async () => {
    const before = await stock(6);
    const res = await state({ states: ['product 6 has stock 1', 'the moon is full'] }).expect(404);
    expect(res.body.error.code).toBe('PROVIDER_STATE_UNKNOWN');
    expect(res.body.error.message).toContain('the moon is full');
    expect(res.body.error.details.known).toContain('product 6 has stock 3');
    expect(await stock(6)).toBe(before);
  });

  it('PLS-26.5 returns 422 for a product that does not exist and rolls the other states back', async () => {
    const before = await stock(6);
    await state({ states: ['product 6 has stock 1', 'product 99999 has stock 1'] }).expect(422);
    expect(await stock(6)).toBe(before);
    await state({ state: 'product 99999 exists' }).expect(422);
  });

  it('PLS-26.5 rejects a body with no state', async () => {
    await state({}).expect(422);
    await state({ states: [] }).expect(422);
  });

  it('PLS-26.5 lists the states it knows', async () => {
    const res = await request(app).get('/test/provider-states').expect(200);
    expect(res.body.data).toContain('product 6 has stock 3');
    expect(res.body.data).toContain('a customer exists');
  });
});
