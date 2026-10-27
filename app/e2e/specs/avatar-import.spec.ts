import { API_URL } from '../env';
import { expect, test } from './fixtures';

async function newCustomer(request: import('@playwright/test').APIRequestContext) {
  const created = await request.post(`${API_URL}/test/users`, { data: { role: 'customer' } });
  expect(created.status()).toBe(201);
  return { Authorization: `Bearer ${(await created.json()).accessToken}` };
}

test('PLS-9.5 the avatar is imported from the fixtures container, the one internal host that is allowed', async ({ request }) => {
  const headers = await newCustomer(request);
  for (const [file, type] of [
    ['avatar.png', 'image/png'],
    ['avatar.jpg', 'image/jpeg'],
  ]) {
    const res = await request.post(`${API_URL}/api/v1/users/me/avatar/import`, { headers, data: { url: `http://fixtures/${file}` } });
    expect(res.status(), file).toBe(201);
    expect((await res.json()).data.contentType).toBe(type);
  }
  const text = await request.post(`${API_URL}/api/v1/users/me/avatar/import`, {
    headers,
    data: { url: 'http://fixtures/not-an-image.png' },
  });
  expect(text.status()).toBe(415);
});

test('PLS-24.10 the import refuses the database, the API itself and the cloud metadata address', async ({ request }) => {
  const headers = await newCustomer(request);
  for (const url of [
    'http://db:5432/',
    'http://api:3000/api/v1/health',
    'http://web:5173/',
    'http://localhost/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
  ]) {
    const res = await request.post(`${API_URL}/api/v1/users/me/avatar/import`, { headers, data: { url } });
    expect(res.status(), url).toBe(422);
    expect((await res.json()).error.details, url).toEqual([{ field: 'url', message: 'That address is not allowed' }]);
  }
});
