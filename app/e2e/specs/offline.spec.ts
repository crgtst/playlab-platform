import { addToCart, expect, test } from './fixtures';

test('PLS-17.2 checkout is disabled while offline and comes back online', async ({ page, context }) => {
  await addToCart(page);
  await page.goto('/cart');
  const checkout = page.getByTestId('checkout-button');
  await expect(checkout).toHaveAttribute('href', '/checkout/shipping');

  await context.setOffline(true);
  await expect(checkout).toBeDisabled();
  await expect(page.getByTestId('checkout-offline-message')).toHaveText("You're offline. You can check out when you're back online.");

  await context.setOffline(false);
  await expect(checkout).toHaveAttribute('href', '/checkout/shipping');
  await expect(page.getByTestId('checkout-offline-message')).toHaveCount(0);
});
