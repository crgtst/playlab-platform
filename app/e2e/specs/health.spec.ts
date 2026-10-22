import { API_URL } from '../env';
import { expect, test } from './fixtures';

test('PLS-12.4 readiness reports the API, database and web app all up', async ({ request }) => {
  const res = await request.get(`${API_URL}/api/v1/health`);
  expect(res.status()).toBe(200);
  expect((await res.json()).checks).toEqual({ api: 'up', db: 'up', web: 'up' });
});
