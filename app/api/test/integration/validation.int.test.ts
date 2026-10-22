import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, resetStack } from './app';

// Behaviour that changed under zod 4 until the schemas were adjusted for it.

let admin: string;

beforeEach(async () => {
  await resetStack();
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'admin@playlab.test', password: 'Password123!' }).expect(200);
  admin = `Bearer ${res.body.accessToken}`;
});

const patchProduct = (body: object) => request(app).patch('/api/v1/products/1').set('Authorization', admin).set('If-Match', '*').send(body);

describe('product PATCH', () => {
  it('keeps the description when the change leaves it out', async () => {
    const before = (await request(app).get('/api/v1/products/1').expect(200)).body.data.description;
    expect(before).not.toBe('');
    const res = await patchProduct({ stock: 3 }).expect(200);
    expect(res.body.data).toMatchObject({ stock: 3, description: before });
  });

  it('refuses an empty change', async () => {
    const res = await patchProduct({}).expect(422);
    expect(res.body.error.details).toEqual([{ field: '', message: 'Provide at least one field to update' }]);
  });
});

describe('validation details', () => {
  it('reports only the type error for a value of the wrong type', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Zed Person', email: 'zed@playlab.test', password: [] })
      .expect(422);
    expect(res.body.error.details).toEqual([{ field: 'password', message: 'Expected string, received array' }]);
  });

  it('keeps the custom message for a paymentIntentId that is not a UUID, and the type error for one that is not a string', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'customer@playlab.test', password: 'Password123!' });
    const order = (paymentIntentId: unknown) =>
      request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ shipping: {}, deliveryDate: '2030-01-01', paymentIntentId });
    const field = (res: request.Response) => res.body.error.details.find((d: { field: string }) => d.field === 'paymentIntentId');
    expect(field(await order('not-a-uuid'))).toEqual({ field: 'paymentIntentId', message: 'paymentIntentId must be a UUID' });
    expect(field(await order(5))).toEqual({ field: 'paymentIntentId', message: 'Expected string, received number' });
  });
});
