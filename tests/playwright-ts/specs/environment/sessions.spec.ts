import { CheckoutPage } from '../../pages/CheckoutPage';
import { LoginPage } from '../../pages/LoginPage';
import { API_URL, expect, test } from '../../support/fixtures';
import { request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RATE_LIMIT = 100;

/** A request context that sends the given session, or none. Dispose it when done. */
async function asSession(sessionId?: string) {
  return playwrightRequest.newContext({ extraHTTPHeaders: sessionId ? { 'X-Test-Session': sessionId } : {} });
}

async function newSession(): Promise<string> {
  const api = await playwrightRequest.newContext();
  const response = await api.post(`${API_URL}/test/sessions`);
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  await api.dispose();
  return id;
}

/** A validation failure: 422 normally, 500 with the wrong-status-code defect on. */
const loginStatus = async (api: APIRequestContext) => (await api.post(`${API_URL}/api/v1/auth/login`, { data: {} })).status();
const categoriesStatus = async (api: APIRequestContext) => (await api.get(`${API_URL}/api/v1/categories`)).status();

test.describe('PLS-28 Test environment: sessions', () => {
  test('PLS-28.6 POST /test/sessions returns the session id and sets the test_session cookie', async () => {
    const api = await playwrightRequest.newContext();
    try {
      const response = await api.post(`${API_URL}/test/sessions`);
      expect(response.status()).toBe(201);
      const body = (await response.json()) as { id: string; idleTimeoutMs: number };
      expect(body.id).toMatch(UUID);
      expect(body.idleTimeoutMs).toBeGreaterThan(0);

      expect(response.headers()['set-cookie']).toMatch(new RegExp(`test_session=${body.id};`));
      const cookies = await api.storageState();
      expect(cookies.cookies.find((cookie) => cookie.name === 'test_session')?.value).toBe(body.id);
    } finally {
      await api.dispose();
    }
  });

  test.describe('PLS-28.1 sessions are isolated from each other and from requests with no session', () => {
    test('defects', async () => {
      const [a, b] = [await asSession(await newSession()), await asSession(await newSession())];
      const none = await asSession();
      try {
        const bug = await a.post(`${API_URL}/test/bugs`, { data: { enable: ['wrong-status-code'] } });
        expect(bug.status()).toBe(200);

        expect(await loginStatus(a)).toBe(500);
        expect(await loginStatus(b)).toBe(422);
        expect(await loginStatus(none)).toBe(422);
        const listed = await b.get(`${API_URL}/test/bugs`);
        expect(((await listed.json()) as { data: { enabled: boolean }[] }).data.filter((defect) => defect.enabled)).toEqual([]);
      } finally {
        await Promise.all([a.dispose(), b.dispose(), none.dispose()]);
      }
    });

    test('chaos rules', async () => {
      const [a, b] = [await asSession(await newSession()), await asSession(await newSession())];
      const none = await asSession();
      try {
        const rule = await a.post(`${API_URL}/test/chaos`, { data: { path: '/api/v1/categories', failNext: 5, status: 503 } });
        expect(rule.status()).toBe(201);

        expect(await categoriesStatus(a)).toBe(503);
        expect(await categoriesStatus(b)).toBe(200);
        expect(await categoriesStatus(none)).toBe(200);
      } finally {
        await Promise.all([a.dispose(), b.dispose(), none.dispose()]);
      }
    });

    test('clocks', async () => {
      const [a, b] = [await asSession(await newSession()), await asSession(await newSession())];
      const none = await asSession();
      try {
        const moved = await a.post(`${API_URL}/test/clock`, { data: { now: '2030-01-01T00:00:00.000Z' } });
        expect(moved.status()).toBe(200);

        expect(((await (await a.get(`${API_URL}/test/clock`)).json()) as { now: string }).now).toMatch(/^2030-01-01T00:00/);
        expect(((await (await b.get(`${API_URL}/test/clock`)).json()) as { offsetMs: number }).offsetMs).toBe(0);
        expect(((await (await none.get(`${API_URL}/test/clock`)).json()) as { offsetMs: number }).offsetMs).toBe(0);
      } finally {
        await Promise.all([a.dispose(), b.dispose(), none.dispose()]);
      }
    });
  });

  test.describe('PLS-28.7 latency and rate limits are per session', () => {
    test("one session's latency rule does not slow the other", async () => {
      const [a, b] = [await asSession(await newSession()), await asSession(await newSession())];
      try {
        const rule = await a.post(`${API_URL}/test/latency`, { data: { path: '/api/v1/categories', delayMs: 400 } });
        expect(rule.status()).toBe(201);

        const timed = async (api: APIRequestContext) => {
          const started = Date.now();
          expect(await categoriesStatus(api)).toBe(200);
          return Date.now() - started;
        };
        expect(await timed(a)).toBeGreaterThanOrEqual(400);
        expect(await timed(b)).toBeLessThan(400);
      } finally {
        await Promise.all([a.dispose(), b.dispose()]);
      }
    });

    test('one session using up its rate limit does not limit the other', async () => {
      const [a, b] = [await asSession(await newSession()), await asSession(await newSession())];
      try {
        for (let i = 0; i < RATE_LIMIT; i++) expect(await categoriesStatus(a)).toBe(200);
        expect(await categoriesStatus(a)).toBe(429);
        expect(await categoriesStatus(b)).toBe(200);
      } finally {
        await Promise.all([a.dispose(), b.dispose()]);
      }
    });
  });

  test.describe('PLS-28.10 the payment frame follows the shop session', () => {
    /** Adds a product, goes through shipping and review, and waits for the payment frame. */
    async function openPaymentFrame(page: Page) {
      await page.goto('/products/1');
      await page.getByTestId('add-to-cart-button').click();
      await expect(page.getByTestId('cart-count')).toHaveText('1');
      await page.goto('/cart');
      await page.getByTestId('checkout-button').click();
      const checkout = new CheckoutPage(page);
      await checkout.fillShipping();
      await checkout.shippingContinue.click();
      await checkout.reviewContinue.click();
      await expect(checkout.paymentFrame.getByTestId('frame-pay-button')).toBeVisible();
      return checkout;
    }

    test('a checkout in a session with button-moves shows the defect, and a checkout with no session does not', async ({
      page,
      browser,
      request,
      hooks,
    }) => {
      const bug = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['button-moves'] } });
      expect(bug.status()).toBe(200);
      const [inSession, noSession] = [await hooks.createUser('customer'), await hooks.createUser('customer')];

      await new LoginPage(page).goto();
      await new LoginPage(page).logIn(inSession);
      const withDefect = await openPaymentFrame(page);
      // The defect adds a late banner that pushes the Pay button down.
      await expect(withDefect.paymentFrame.getByTestId('frame-late-banner')).toBeVisible();

      // browser.newContext() inherits the test's X-Test-Session header, so say that this one sends none.
      const plainContext = await browser.newContext({ serviceWorkers: 'block', extraHTTPHeaders: {} });
      try {
        const plain = await plainContext.newPage();
        await new LoginPage(plain).goto();
        await new LoginPage(plain).logIn(noSession);
        const without = await openPaymentFrame(plain);
        await plain.waitForTimeout(1500);
        await expect(without.paymentFrame.getByTestId('frame-late-banner')).toHaveCount(0);
      } finally {
        await plainContext.close();
      }
    });
  });
});
