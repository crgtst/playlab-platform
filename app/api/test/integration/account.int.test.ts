import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../src/db/pool';
import { app, resetStack } from './app';

const CUSTOMER = { email: 'customer@playlab.test', password: 'Password123!' };

beforeEach(resetStack);

async function logIn(user = CUSTOMER) {
  const res = await request(app).post('/api/v1/auth/login').send(user).expect(200);
  return { auth: `Bearer ${res.body.accessToken}`, refreshToken: res.body.refreshToken as string };
}

const patchMe = (auth: string, body: Record<string, unknown>) =>
  request(app).patch('/api/v1/users/me').set('Authorization', auth).send(body);

describe('PLS-22.1 to 22.3, 22.6 profile changes', () => {
  it('PLS-22.1 changes the name, as GET /users/me and /auth/me (the header) show', async () => {
    const { auth } = await logIn();
    const res = await patchMe(auth, { name: 'Casey Renamed' }).expect(200);
    expect(res.body.data.name).toBe('Casey Renamed');
    expect((await request(app).get('/api/v1/users/me').set('Authorization', auth)).body.data.name).toBe('Casey Renamed');
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', auth)).body.user.name).toBe('Casey Renamed');
  });

  it('keeps names with accents, whatever registration defects are on', async () => {
    const { auth } = await logIn();
    await request(app)
      .post('/test/bugs')
      .send({ enable: ['fada-rejected'] })
      .expect(200);
    await patchMe(auth, { name: 'Seán Ó Briain' }).expect(200);
  });

  it('PLS-22.2 changes the email with the current password; the new one logs in and the old one does not', async () => {
    const { auth } = await logIn();
    const res = await patchMe(auth, { email: 'casey.new@playlab.test', currentPassword: CUSTOMER.password }).expect(200);
    expect(res.body.data.email).toBe('casey.new@playlab.test');
    await request(app).post('/api/v1/auth/login').send({ email: 'casey.new@playlab.test', password: CUSTOMER.password }).expect(200);
    await request(app).post('/api/v1/auth/login').send(CUSTOMER).expect(401);
  });

  it('PLS-22.3 refuses a wrong or missing current password with 422 on currentPassword', async () => {
    const { auth } = await logIn();
    for (const body of [{ email: 'x@playlab.test', currentPassword: 'wrong-password' }, { email: 'x@playlab.test' }]) {
      const res = await patchMe(auth, body).expect(422);
      expect(res.body.error.details).toEqual([{ field: 'currentPassword', message: expect.any(String) }]);
    }
    expect((await request(app).get('/api/v1/users/me').set('Authorization', auth)).body.data.email).toBe(CUSTOMER.email);
  });

  it('PLS-22.6 refuses an email that belongs to another account with 409', async () => {
    const { auth } = await logIn();
    const res = await patchMe(auth, { email: 'admin@playlab.test', currentPassword: CUSTOMER.password }).expect(409);
    expect(res.body.error.code).toBe('EMAIL_IN_USE');
    expect((await request(app).get('/api/v1/users/me').set('Authorization', auth)).body.data.email).toBe(CUSTOMER.email);
  });

  it('ignores fields it does not own, such as role', async () => {
    const { auth } = await logIn();
    const res = await patchMe(auth, { name: 'Casey', role: 'admin', emailVerified: false }).expect(200);
    expect(res.body.data).toMatchObject({ role: 'customer', emailVerified: true });
  });

  it('needs a name or an email', async () => {
    const { auth } = await logIn();
    await patchMe(auth, {}).expect(422);
  });
});

describe('PLS-22.4 and 22.5 account deletion', () => {
  it('PLS-22.4 ends every session at once: access tokens get 401 and refresh tokens stop working', async () => {
    const phone = await logIn();
    const laptop = await logIn();
    await request(app).delete('/api/v1/users/me').set('Authorization', phone.auth).expect(204);

    for (const device of [phone, laptop]) {
      const res = await request(app).get('/api/v1/users/me').set('Authorization', device.auth).expect(401);
      expect(res.body.error.code).toBe('TOKEN_REVOKED');
      await request(app).post('/api/v1/auth/refresh').send({ refreshToken: device.refreshToken }).expect(401);
    }
    await request(app).post('/api/v1/auth/login').send(CUSTOMER).expect(401);
  });

  it("PLS-22.5 keeps the orders but anonymises the customer's name and email", async () => {
    const { auth } = await logIn();
    await request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: 1 }).expect(201);
    const order = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', auth)
      .send({
        shipping: { fullName: 'Casey Customer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' },
        deliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
        payment: { cardNumber: '4242 4242 4242 4242', expiry: '12/30', cvc: '123', nameOnCard: 'Casey Customer' },
      })
      .expect(201);
    await request(app).delete('/api/v1/users/me').set('Authorization', auth).expect(204);

    const admin = await logIn({ email: 'admin@playlab.test', password: 'Password123!' });
    const res = await request(app).get(`/api/v1/orders/${order.body.data.id}`).set('Authorization', admin.auth).expect(200);
    expect(res.body.data.customer).toMatchObject({ name: 'Deleted user', email: expect.stringMatching(/^deleted-\d+@playlab\.invalid$/) });
    expect(res.body.data.totals.totalCents).toBe(order.body.data.totals.totalCents);
  });

  it('removes personal data and leaves other accounts alone', async () => {
    const { auth } = await logIn();
    const admin = await logIn({ email: 'admin@playlab.test', password: 'Password123!' });
    await request(app).post('/api/v1/wishlist/items').set('Authorization', auth).send({ productId: 1 }).expect(201);
    await request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: 2 }).expect(201);
    const [{ id }] = await query<{ id: number }>('SELECT id FROM users WHERE email = $1', [CUSTOMER.email]);

    await request(app).delete('/api/v1/users/me').set('Authorization', auth).expect(204);
    const [{ wishlist, carts }] = await query<{ wishlist: number; carts: number }>(
      'SELECT (SELECT COUNT(*) FROM wishlist_items WHERE user_id = $1) AS wishlist, (SELECT COUNT(*) FROM carts WHERE user_id = $1) AS carts',
      [id],
    );
    expect({ wishlist, carts }).toEqual({ wishlist: 0, carts: 0 });
    await request(app).get('/api/v1/users/me').set('Authorization', admin.auth).expect(200);
  });
});
