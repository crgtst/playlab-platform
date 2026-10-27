import { API_URL, expect, test } from '../support/fixtures';
import { bearer } from '../support/jwt';

/**
 * OWASP API4:2023 Unrestricted Resource Consumption: the rate limit cannot be dodged by changing a header (PLS-24.6),
 * and a page size has a maximum (PLS-24.7).
 *
 * The rate limit test needs the default limit of 100 requests a minute. It is per test session, so it uses up its own.
 */
test.describe('API4 rate limit', () => {
  const useUpTheLimit = async (request: import('@playwright/test').APIRequestContext) => {
    for (let i = 0; i < 100; i++) expect((await request.get(`${API_URL}/api/v1/categories`)).status(), `request ${i + 1}`).toBe(200);
  };
  const withForwardedFor = (request: import('@playwright/test').APIRequestContext, n: number) =>
    request.get(`${API_URL}/api/v1/categories`, { headers: { 'X-Forwarded-For': `198.51.100.${n}` } });

  test('PLS-24.6 a guest who has used up the limit still gets 429 when the X-Forwarded-For header changes each time', async ({
    request,
  }) => {
    await useUpTheLimit(request);
    for (let n = 1; n <= 5; n++) {
      const response = await withForwardedFor(request, n);
      expect(response.status(), `X-Forwarded-For 198.51.100.${n}`).toBe(429);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
      expect(response.headers()['retry-after']).toBeTruthy();
    }
  });

  test('PLS-24.6 defect rate-limit-bypass gives each new X-Forwarded-For a fresh limit', async ({ request, hooks }) => {
    await hooks.enableDefects('rate-limit-bypass');
    await useUpTheLimit(request);
    expect((await withForwardedFor(request, 1)).status()).toBe(200);
    expect((await withForwardedFor(request, 2)).status()).toBe(200);
  });
});

test.describe('API4 page size', () => {
  test('PLS-24.7 a limit above the documented maximum is refused with 422 on products and orders', async ({ request, customer }) => {
    const products = await request.get(`${API_URL}/api/v1/products?limit=100000`);
    expect(products.status()).toBe(422);
    expect(JSON.stringify(await products.json())).toContain('limit');
    expect((await request.get(`${API_URL}/api/v1/orders?limit=100000`, { headers: bearer(customer.accessToken) })).status()).toBe(422);
  });

  test('PLS-24.7 defect no-page-limit accepts limit=100000 and answers with it', async ({ request, hooks, customer }) => {
    await hooks.enableDefects('no-page-limit');
    const products = await request.get(`${API_URL}/api/v1/products?limit=100000`);
    expect(products.status()).toBe(200);
    // The documented maximum is 48. With the defect on, the API takes whatever page size it is asked for.
    expect(((await products.json()) as { meta: { limit: number } }).meta.limit).toBe(100000);
    expect((await request.get(`${API_URL}/api/v1/orders?limit=100000`, { headers: bearer(customer.accessToken) })).status()).toBe(200);
  });
});
