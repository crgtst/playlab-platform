import { API_URL } from '../env';
import { expect, logIn, test } from './fixtures';

test('PLS-1.8 an expired session falls back to a guest cart when adding an item', async ({ page, context, request }) => {
  await logIn(page);

  // The access token expires (15 minutes pass) and the refresh token stops working (a reset wipes them all).
  await request.post(`${API_URL}/test/reset`);
  await request.post(`${API_URL}/test/clock`, { data: { advanceMs: 20 * 60_000 } });

  await page.goto('/products/1');
  await page.getByTestId('add-to-cart-button').click();
  await expect(page.getByTestId('toast-message').last()).toHaveText('Wireless Earbuds added to your cart');
  await expect(page.getByTestId('add-to-cart-error')).toHaveCount(0);
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  const names = (await context.cookies()).map((c) => c.name);
  expect(names).not.toContain('session');
  expect(names).not.toContain('refresh_token');
});
