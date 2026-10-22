import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { REFRESH_COOKIE, SESSION_COOKIE } from '../../src/middleware/auth';
import { app, resetStack } from './app';

const CUSTOMER = { email: 'customer@playlab.test', password: 'Password123!' };

beforeEach(resetStack);

/** A browser that logged in earlier and kept its cookies. */
async function loggedInBrowser() {
  const browser = request.agent(app);
  await browser.post('/api/v1/auth/login').send(CUSTOMER).expect(200);
  return browser;
}

/** The access token expires (15 minutes pass) and the refresh token stops working (a reset wipes them all). */
async function killSession() {
  await resetStack();
  await request(app)
    .post('/test/clock')
    .send({ advanceMs: 20 * 60_000 })
    .expect(200);
}

const cleared = (setCookie: string[] | undefined, name: string) =>
  (setCookie ?? []).some((c) => c.startsWith(`${name}=;`) && c.includes('Expires=Thu, 01 Jan 1970'));

describe('PLS-1.8 an expired session that cannot be refreshed falls back to a guest', () => {
  it('PLS-1.8 a failed refresh clears the expired session cookies', async () => {
    const browser = await loggedInBrowser();
    await killSession();
    const res = await browser.post('/api/v1/auth/refresh').expect(401);
    const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cleared(setCookie, SESSION_COOKIE), `${SESSION_COOKIE} cleared`).toBe(true);
    expect(cleared(setCookie, REFRESH_COOKIE), `${REFRESH_COOKIE} cleared`).toBe(true);
  });

  it('leaves the cookies alone when another tab has just used the same refresh token', async () => {
    const login = await request(app).post('/api/v1/auth/login').send(CUSTOMER).expect(200);
    const tab = () => request(app).post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken });
    await tab().expect(200);
    const res = await tab().expect(401);
    const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cleared(setCookie, SESSION_COOKIE)).toBe(false);
    expect(cleared(setCookie, REFRESH_COOKIE)).toBe(false);
  });

  it('PLS-1.8 after the failed refresh, the item goes into a guest cart', async () => {
    const browser = await loggedInBrowser();
    await killSession();
    const item = { productId: 1, quantity: 1 };

    // The expired token itself is still refused (PLS-1.5), which is what sends the web app to refresh.
    expect((await browser.post('/api/v1/cart/items').send(item).expect(401)).body.error.code).toBe('TOKEN_EXPIRED');
    await browser.post('/api/v1/auth/refresh').expect(401);

    await browser.post('/api/v1/cart/items').send(item).expect(201);
    const cart = (await browser.get('/api/v1/cart').expect(200)).body;
    expect(cart.items).toMatchObject([{ productId: 1, quantity: 1 }]);
    expect((await browser.get('/api/v1/auth/me').expect(401)).body.error.code).toBe('UNAUTHORIZED');
  });
});
