import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';
import type { Page } from '@playwright/test';

const productFixture = product('EL-001');

async function logIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function addProduct(page: Page) {
  await page.goto(`/products/${productFixture.id}`);
  const added = page.waitForResponse(
    (response) => response.url().includes('/api/v1/cart/items') && response.request().method() === 'POST',
  );
  await page.getByTestId('add-to-cart-button').click();
  expect((await added).status()).toBe(201);
}

async function scanForSeriousViolations(page: Page, path: string, theme: 'light' | 'dark') {
  await page.goto(path);
  const themeToggle = page.getByTestId('theme-toggle');
  const isDark = (await themeToggle.getAttribute('aria-pressed')) === 'true';
  if (isDark !== (theme === 'dark')) await themeToggle.click();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();
  const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious, `${theme} theme at ${path}: ${JSON.stringify(serious.map(({ id, description, nodes }) => ({ id, description, nodes: nodes.map((node) => node.target) })))}`).toEqual([]);
}

test.describe('PLS-11 Accessibility, security and display', () => {
  test('PLS-11.1 home, product, cart and every checkout step have no serious or critical axe violations', async ({
    page,
    customer,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await logIn(page, customer);
    await addProduct(page);

    const shipping = new Date(Date.now() + 5 * 86_400_000);
    const deliveryDate = new Date(shipping.getTime() - shipping.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    await page.goto('/checkout/shipping');
    await page.getByTestId('shipping-full-name').fill('Accessibility Test');
    await page.getByTestId('shipping-line1').fill('1 Main Street');
    await page.getByTestId('shipping-city').fill('Dublin');
    await page.getByTestId('shipping-postcode').fill('D01 F5P2');
    await page.getByTestId('shipping-delivery-date').fill(deliveryDate);
    await page.getByTestId('shipping-continue-button').click();
    await expect(page.getByTestId('review-items')).toBeVisible();
    await page.getByTestId('review-continue-button').click();
    await expect(page.getByTestId('payment-section')).toBeVisible();
    await expect(page.getByTestId('payment-frame')).toBeVisible();

    const paths = [
      '/',
      `/products/${productFixture.id}`,
      '/cart',
      '/checkout/shipping',
      '/checkout/review',
      '/checkout/payment',
    ];
    for (const theme of ['light', 'dark'] as const) {
      for (const path of paths) await scanForSeriousViolations(page, path, theme);
    }
  });

  test('PLS-11.2 review text containing a script tag is rendered as text and does not execute', async ({
    page,
    request,
    hooks,
  }) => {
    const admin = await hooks.createUser('admin');
    const reviewer = await hooks.createUser('customer');
    const sku = `PW-REV-${randomUUID().replaceAll('-', '').slice(0, 24)}`;
    const created = await request.post(`${API_URL}/api/v1/products`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: {
        sku,
        name: 'Review text escaping check',
        description: 'Temporary product for review rendering coverage',
        category: productFixture.category,
        priceCents: productFixture.priceCents,
        stock: 1,
      },
    });
    expect(created.status()).toBe(201);
    const productId = ((await created.json()) as { data: { id: number } }).data.id;
    const scriptText = '<script>window.__reviewScriptExecuted = true</script>';

    try {
      const review = await request.post(`${API_URL}/api/v1/products/${productId}/reviews`, {
        headers: { Authorization: `Bearer ${reviewer.accessToken}` },
        data: { rating: 5, title: 'Safe text', body: scriptText },
      });
      expect(review.status()).toBe(201);
      await page.addInitScript(() => {
        (window as Window & { __reviewScriptExecuted?: boolean }).__reviewScriptExecuted = false;
      });
      await page.goto(`/products/${productId}`);
      await expect(page.getByTestId('review-body')).toHaveText(scriptText);
      expect(await page.evaluate(() => (window as Window & { __reviewScriptExecuted?: boolean }).__reviewScriptExecuted)).toBe(
        false,
      );
      await expect(page.getByTestId('review-body').locator('script')).toHaveCount(0);
    } finally {
      const deleted = await request.delete(`${API_URL}/api/v1/products/${productId}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
      });
      expect(deleted.status(), 'Delete the temporary product and its test review').toBe(204);
    }
  });

  for (const scenario of [
    { label: '500 characters', name: 'A'.repeat(500) },
    { label: 'emoji', name: 'PlayLab 👩🏽‍💻 🛍️' },
    { label: 'right-to-left text', name: 'שָׁלוֹם עולם' },
  ]) {
    test(`PLS-11.3 customer name with ${scenario.label} does not break the layout`, async ({ page, hooks }) => {
      const { name } = scenario;
      const customer = await hooks.createUser('customer', name);
      await page.setViewportSize({ width: 390, height: 844 });
      await logIn(page, customer);

      await expect(page.getByTestId('header-user-name')).toHaveText(name);
      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(widths.page, `Page width ${widths.page}px exceeds viewport ${widths.viewport}px for name: ${name}`).toBeLessThanOrEqual(
        widths.viewport,
      );
    });
  }

  test('PLS-11.4 navigation collapses to a menu button below 768 pixels', async ({ page }) => {
    await page.setViewportSize({ width: 767, height: 900 });
    await page.goto('/');

    const menuButton = page.getByTestId('nav-menu-button');
    const menu = page.getByTestId('main-menu');
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();

    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByTestId('nav-products')).toBeVisible();
  });

  test('PLS-11.5 Irish preference translates navigation and checkout text', async ({ page, customer }) => {
    await logIn(page, customer);
    await addProduct(page);
    await page.getByTestId('language-select').selectOption('ga');

    await expect(page.getByTestId('nav-products')).toHaveText('Siopa');
    await page.goto('/checkout/shipping');
    await expect(page.getByRole('heading', { name: 'Seiceáil amach' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sonraí seachadta' })).toBeVisible();
    await expect(page.getByLabel('Ainm iomlán')).toBeVisible();
  });

  test('PLS-11.6 offline actions show a friendly message and recover when online', async ({ page, context, customer }) => {
    await logIn(page, customer);
    await addProduct(page);
    await page.goto('/cart');
    await expect(page.getByTestId('checkout-button')).toBeEnabled();

    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toHaveText("You're offline. We'll try again when you're back online.");
    await expect(page.getByTestId('checkout-button')).toBeDisabled();
    await expect(page.getByTestId('checkout-offline-message')).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).toHaveAttribute('data-state', 'online');
    await expect(page.getByTestId('checkout-button')).toBeEnabled();
    await expect(page.getByTestId('cart-item')).toBeVisible();
  });
});
