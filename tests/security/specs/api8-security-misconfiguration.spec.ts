import { API_URL, WEB_URL } from '../support/env';
import { expect, test } from '../support/fixtures';

/**
 * OWASP API8:2023 Security Misconfiguration: every response carries the security headers (PLS-24.11), and an unexpected
 * error does not give away how the server is built (PLS-24.12).
 */
const HEADERS = ['x-content-type-options', 'referrer-policy', 'content-security-policy', 'permissions-policy'];

test.describe('API8 security headers', () => {
  const routes: [string, string][] = [
    ['a JSON read', `${API_URL}/api/v1/products`],
    ['health', `${API_URL}/api/v1/health`],
    ['an unknown route (404)', `${API_URL}/api/v1/no-such-route`],
    ['a missing token (401)', `${API_URL}/api/v1/orders`],
    ['the OpenAPI file', `${API_URL}/api/openapi.json`],
    ['the docs page', `${API_URL}/api/docs/`],
    ['the payment frame', `${API_URL}/pay/frame`],
    ['the web app', `${WEB_URL}/`],
  ];

  test('PLS-24.11 every API and web response has X-Content-Type-Options, Referrer-Policy, Content-Security-Policy and Permissions-Policy', async ({
    request,
  }) => {
    for (const [name, url] of routes) {
      const headers = (await request.get(url)).headers();
      expect(headers['x-content-type-options'], `${name}: x-content-type-options`).toBe('nosniff');
      for (const header of HEADERS) expect(headers[header], `${name}: ${header}`).toBeTruthy();
    }
    const validation = await request.post(`${API_URL}/api/v1/auth/login`, { data: {} });
    expect(validation.status()).toBe(422);
    for (const header of HEADERS) expect(validation.headers()[header], `a validation error (422): ${header}`).toBeTruthy();
  });

  test('PLS-24.11 the API policy allows nothing: no scripts, no framing, no form posts', async ({ request }) => {
    const csp = (await request.get(`${API_URL}/api/v1/products`)).headers()['content-security-policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  test('PLS-24.11 defect missing-security-headers sends none of the four headers', async ({ request, hooks }) => {
    await hooks.enableDefects('missing-security-headers');
    const headers = (await request.get(`${API_URL}/api/v1/products`)).headers();
    for (const header of HEADERS) expect(headers[header], header).toBeUndefined();
  });
});

test.describe('API8 error bodies', () => {
  // search-apostrophe is a real defect in the product search: an apostrophe causes an unexpected error, which is what is needed
  // to see what the API says about one.
  const brokenSearch = (request: import('@playwright/test').APIRequestContext) =>
    request.get(`${API_URL}/api/v1/products`, { params: { q: "O'Neill" } });

  test('PLS-24.12 an unexpected 500 has only the standard error fields: no stack trace, SQL or file path', async ({ request, hooks }) => {
    await hooks.enableDefects('search-apostrophe');
    const res = await brokenSearch(request);
    expect(res.status()).toBe(500);
    const body = (await res.json()) as { error: Record<string, unknown> };
    expect(Object.keys(body.error)).toEqual(['code', 'message', 'details', 'correlationId']);
    expect(body.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Something went wrong', details: null });
    expect(JSON.stringify(body)).not.toMatch(/SELECT|ILIKE|\.(ts|js):\d+|\/app\/|node_modules|at .*\(/);
  });

  test('PLS-24.12 defect verbose-errors puts the stack trace, the SQL and file paths in the 500', async ({ request, hooks }) => {
    await hooks.enableDefects('search-apostrophe', 'verbose-errors');
    const res = await brokenSearch(request);
    expect(res.status()).toBe(500);
    const { details } = ((await res.json()) as { error: { details: { stack: string; query: string } } }).error;
    expect(details.stack).toMatch(/\.(ts|js):\d+/);
    expect(details.query).toContain('SELECT');
  });
});
