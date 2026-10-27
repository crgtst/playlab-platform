import { API_URL, expect, test } from '../support/fixtures';
import { bearer } from '../support/jwt';

/**
 * OWASP API7:2023 Server Side Request Forgery: "import my avatar from a URL" must not make the server fetch an address on
 * its own network. PLS-24.10
 *
 * The API runs in a container, so 127.0.0.1:3000 is the API itself, `db` and `web` are its neighbours, and 169.254.169.254
 * is where a cloud host keeps credentials. `fixtures` is the one name the import is allowed to fetch.
 */
const importUrl = (request: import('@playwright/test').APIRequestContext, token: string, url: string) =>
  request.post(`${API_URL}/api/v1/users/me/avatar/import`, { headers: bearer(token), data: { url } });

const BLOCKED = [
  ['localhost', 'http://localhost:3000/api/openapi.json'],
  ['the loopback address', 'http://127.0.0.1:3000/api/openapi.json'],
  ['the loopback address in IPv6', 'http://[::1]:3000/api/openapi.json'],
  ['the db container', 'http://db:5432/'],
  ['the web container', 'http://web:5173/'],
  ['a private address', 'http://10.0.0.1/avatar.png'],
  ['the cloud metadata address', 'http://169.254.169.254/latest/meta-data/'],
] as const;

test.describe('API7 server side request forgery', () => {
  test("PLS-24.10 an address on the server's own network is refused with 422", async ({ request, customer }) => {
    for (const [name, url] of BLOCKED) {
      const res = await importUrl(request, customer.accessToken, url);
      expect(res.status(), name).toBe(422);
      expect(JSON.stringify(await res.json()), name).toContain('That address is not allowed');
    }
  });

  test('PLS-24.10 the one allowed host still works, so the refusals are not just a broken feature', async ({ request, customer }) => {
    const res = await importUrl(request, customer.accessToken, 'http://fixtures/avatar.png');
    expect(res.status()).toBe(201);
  });

  test('PLS-24.10 defect ssrf-avatar-url makes the server fetch an internal address, which answers 415 because its reply is not an image', async ({
    request,
    hooks,
    customer,
  }) => {
    await hooks.enableDefects('ssrf-avatar-url');
    // The API's own OpenAPI file came back over the container's loopback: the request was made.
    const res = await importUrl(request, customer.accessToken, 'http://127.0.0.1:3000/api/openapi.json');
    expect(res.status()).toBe(415);
  });
});
