import { Locator, Page } from '@playwright/test';
import { API_URL } from '../env';
import { addToCart, CUSTOMER, expect, goToPayment, logIn, payWithCard, test } from './fixtures';

/**
 * Gate 1 baselines: screenshots of the existing UI, taken before Phase 1 changes it.
 * Run with `npm run test:gate1`; regenerate only on purpose, with `npm run test:gate1 -- --update-snapshots`.
 * The baselines are platform-specific (macOS), so CI doesn't run them.
 */

// Both clocks are pinned, so order dates and the delivery-date window never change between runs.
const NOW = '2026-11-02T10:00:00.000Z';
const ADMIN = { email: 'admin@playlab.test', password: 'Password123!' };

test.use({ locale: 'en-IE', timezoneId: 'Europe/Dublin', colorScheme: 'light', viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page, request }) => {
  await request.post(`${API_URL}/test/clock`, { data: { now: NOW } });
  await page.clock.setFixedTime(NOW);
});

// The pinned API clock is global state; put it back so suites run afterwards don't see a moved clock.
test.afterEach(async ({ request }) => {
  await request.post(`${API_URL}/test/reset`);
});

/** `ready` shows the page has its data; live streams keep the network busy, so networkidle never comes. */
async function snap(page: Page, name: string, ready: Locator) {
  await expect(ready.first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    mask: [page.getByTestId('live-indicator'), page.getByTestId('stock-live-indicator'), page.getByTestId('toast-region')],
  });
}

test('@gate1 storefront pages', async ({ page }) => {
  const pages: [string, string, string][] = [
    ['home', '/', 'offer'],
    ['products', '/products', 'product-card'],
    ['product', '/products/1', 'gallery-image'],
    ['new-arrivals', '/new-arrivals', 'product-card'],
    ['stores', '/stores', 'store-locate-button'],
    ['login', '/login', 'login-form'],
    ['register', '/register', 'register-form'],
  ];
  for (const [name, path, ready] of pages) {
    await page.goto(path);
    await snap(page, name, page.getByTestId(ready));
  }
});

test('@gate1 cart and checkout', async ({ page }) => {
  await logIn(page);
  await addToCart(page);
  await page.goto('/cart');
  await snap(page, 'cart', page.getByTestId('cart-item'));
  await goToPayment(page);
  await snap(page, 'checkout-payment', page.frameLocator('[data-testid="payment-frame"]').getByTestId('frame-pay-button'));
  await payWithCard(page);
  await snap(page, 'order-confirmation', page.getByTestId('order-confirmation'));
  await page.goto('/account');
  await snap(page, 'account', page.getByTestId('order-row'));
});

test('@gate1 admin pages', async ({ page, request }) => {
  await request.post(`${API_URL}/test/seed`, { data: { fixtures: ['orders-for-admin'] } });
  await logIn(page, ADMIN);
  await page.goto('/admin/orders');
  await expect(page.getByTestId('admin-order-row').first()).toBeVisible();
  // The fixture's emails have a random suffix, and their width moves the table's columns.
  await page.getByTestId('admin-order-email').evaluateAll((els) => els.forEach((el) => (el.textContent = 'grid@playlab.test')));
  await snap(page, 'admin-orders', page.getByTestId('admin-order-row'));
  await page.goto('/admin/products');
  await snap(page, 'admin-products', page.getByTestId('admin-products-table'));
});

test('@gate1 customer is refused the admin area', async ({ page }) => {
  await logIn(page, CUSTOMER);
  await page.goto('/admin/orders');
  await snap(page, 'admin-forbidden', page.getByTestId('forbidden'));
});
