import { expect, logIn, test } from './fixtures';

test('PLS-22.1 a changed name shows in the header', async ({ page }) => {
  await logIn(page);
  await expect(page.getByTestId('header-user-name')).toHaveText('Casey Customer');

  // The browser's own session cookie authenticates the change, through the web origin's /api proxy.
  const res = await page.request.patch('/api/v1/users/me', { data: { name: 'Casey Renamed' } });
  expect(res.status()).toBe(200);

  await page.reload();
  await expect(page.getByTestId('header-user-name')).toHaveText('Casey Renamed');
});
