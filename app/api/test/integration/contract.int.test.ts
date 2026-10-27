import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from './app';

describe('methods the OpenAPI file does not list', () => {
  it('PLS-26.6 returns 405 METHOD_NOT_ALLOWED with an Allow header', async () => {
    const res = await request(app).trace('/api/v1/addresses/suggest').expect(405);
    expect(res.body.error.code).toBe('METHOD_NOT_ALLOWED');
    expect(res.headers.allow).toBe('GET');
    expect(res.body.error.correlationId).toBeTruthy();
  });

  it('PLS-26.6 lists every method the path does allow', async () => {
    const res = await request(app).delete('/api/v1/auth/login').expect(405);
    expect(res.headers.allow).toBe('POST');
    const product = await request(app).post('/api/v1/products/1').expect(405);
    expect(product.headers.allow.split(', ').sort()).toEqual(['DELETE', 'GET', 'PATCH', 'PUT']);
  });

  it('PLS-26.6 matches paths with parameters', async () => {
    await request(app).put('/api/v1/products/5/reviews').expect(405);
  });

  it('PLS-26.6 still returns 404 for a path that is not in the file, and for the test hooks it does list', async () => {
    const res = await request(app).get('/api/v1/nothing-here').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    await request(app).post('/api/v1/auth/login/extra').expect(404);
  });

  it('PLS-26.6 refuses an unlisted method before the login check', async () => {
    const res = await request(app).trace('/api/v1/cart/items').expect(405);
    expect(res.headers.allow).toBe('POST');
  });

  it('PLS-26.6 does not let /orders/{id} and /users/{id}/avatar catch a literal path with the wrong method', async () => {
    await request(app).get('/api/v1/orders/bulk-status').expect(405);
    await request(app).get('/api/v1/users/me/avatar').expect(405);
  });

  it('PLS-26.6 answers OPTIONS with exactly the listed methods, and leaves HEAD alone', async () => {
    const options = await request(app).options('/api/v1/orders/bulk-status').expect(200);
    expect(options.headers.allow).toBe('POST');
    const products = await request(app).options('/api/v1/products').expect(200);
    expect(products.headers.allow).toBe('GET, HEAD, POST');
    await request(app).head('/api/v1/products').expect(200);
  });
});

describe('ids too large for the database', () => {
  it('PLS-26.7 returns 404 for an avatar of a user id above 2147483647', async () => {
    await request(app).get('/api/v1/users/1307674368000/avatar').expect(404);
    await request(app).get('/api/v1/users/2147483648/avatar').expect(404);
    await request(app).get('/api/v1/products/219199818638453220000000000').expect(404);
    await request(app).get('/api/v1/orders/55146753715').expect(404);
    await request(app).delete('/api/v1/wishlist/items/5730348837316502000').expect(404);
  });

  it('PLS-26.7 still looks up the largest id the database holds', async () => {
    const res = await request(app).get('/api/v1/products/2147483647').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('input that used to cause a 500', () => {
  it('PLS-26.2 returns 422 for a number in a JSON body that is larger than the database can hold', async () => {
    const user = await request(app).post('/test/users').send({}).expect(201);
    const auth = { Authorization: `Bearer ${user.body.accessToken}` };
    const cart = await request(app).post('/api/v1/cart/items').set(auth).send({ productId: 53287031635 }).expect(422);
    expect(cart.body.error.details[0].field).toBe('productId');
    await request(app).post('/api/v1/wishlist/items').set(auth).send({ productId: 1e20 }).expect(422);
    await request(app).post('/api/v1/cart/items').set(auth).send({ productId: 6, quantity: 1 }).expect(201);
  });

  it('PLS-26.2 returns 404, not 500, for a wishlist product id that is not a whole number', async () => {
    const user = await request(app).post('/test/users').send({}).expect(201);
    const auth = { Authorization: `Bearer ${user.body.accessToken}` };
    for (const id of ['0.5', 'abc', '1e3']) await request(app).delete(`/api/v1/wishlist/items/${id}`).set(auth).expect(404);
  });

  it('PLS-26.2 returns 400 for an avatar upload that is not valid multipart data', async () => {
    const signup = await request(app).post('/test/users').send({}).expect(201);
    const auth = { Authorization: `Bearer ${signup.body.accessToken}` };
    await request(app).post('/api/v1/users/me/avatar').set(auth).set('Content-Type', 'multipart/form-data').expect(400);
    await request(app)
      .post('/api/v1/users/me/avatar')
      .set(auth)
      .set('Content-Type', 'multipart/form-data; boundary=xyz')
      .send('--xyz\r\nnot a part')
      .expect(400);
  });

  it('PLS-26.2 returns 422 for a null character in a query string or a JSON body', async () => {
    const query = await request(app).get('/api/v1/products?q=a%00b').expect(422);
    expect(query.body.error.details[0]).toEqual({ field: 'q', message: 'Must not contain null characters' });
    const body = await request(app).post('/api/v1/auth/login').send({ email: 'a\u0000b@playlab.test', password: 'x' }).expect(422);
    expect(body.body.error.details[0].field).toBe('email');
  });

  it('PLS-26.2 returns 401 for a refresh token that is not a string', async () => {
    for (const refreshToken of [{}, [], 5, true]) {
      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
      expect(res.body.error.code).toBe('REFRESH_TOKEN_MISSING');
    }
  });
});
