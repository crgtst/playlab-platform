import { LoginPage } from '../../pages/LoginPage';
import { API_URL, expect, test } from '../../support/fixtures';
import { createProduct, deleteProduct, updateProduct, getProduct } from '../../support/products';
import type { CatalogueProduct } from '../../support/products';
import type { APIRequestContext, Page } from '@playwright/test';
import type { TestUser } from '../../support/hooks';

async function setPrice(request: APIRequestContext, admin: TestUser, product: CatalogueProduct, priceCents: number) {
  const { etag } = await getProduct(request, product.id);
  const response = await updateProduct(request, admin, product.id, etag, { priceCents });
  expect(response.status(), 'Change the product price').toBe(200);
}

const card = (page: Page, product: CatalogueProduct) => page.getByTestId('product-card').filter({ hasText: product.name });
const price = (page: Page, product: CatalogueProduct) => card(page, product).getByTestId('product-price');

/** Visits the catalogue online until the service worker controls the page and has saved the product list. */
async function warmCache(page: Page, product: CatalogueProduct) {
  const url = `/products?q=${encodeURIComponent(product.name)}`;
  await page.goto(url);
  await expect(page.getByTestId('offline-ready')).toBeVisible();
  await page.reload();
  await expect(card(page, product)).toBeVisible();
  return url;
}

test.describe('PLS-17 Offline catalogue', () => {
  test.describe('with service workers allowed', () => {
    // The suite blocks service workers by default (see playwright.config.ts), because they answer requests before page.route can.
    test.use({ serviceWorkers: 'allow' });

    test('PLS-17.1 a visited catalogue still loads offline, with a notice about saved prices', async ({
      page,
      context,
      request,
      hooks,
    }) => {
      const admin = await hooks.createUser('admin');
      const product = await createProduct(request, admin, { priceCents: 1999, stock: 5 });
      try {
        const url = await warmCache(page, product);

        await context.setOffline(true);
        await page.goto(url);
        await expect(card(page, product)).toBeVisible();
        await expect(price(page, product)).toHaveAttribute('data-price-cents', '1999');
        await expect(page.getByTestId('offline-catalogue-notice')).toHaveText(
          "You're offline: showing saved prices, which may be out of date.",
        );
      } finally {
        await context.setOffline(false);
        await deleteProduct(request, admin, product.id);
      }
    });

    test('PLS-17.3 back online, the catalogue reloads with current prices', async ({ page, context, request, hooks }) => {
      const admin = await hooks.createUser('admin');
      const product = await createProduct(request, admin, { priceCents: 1999, stock: 5 });
      try {
        const url = await warmCache(page, product);
        await setPrice(request, admin, product, 2499);

        await context.setOffline(true);
        await page.goto(url);
        await expect(price(page, product)).toHaveAttribute('data-price-cents', '1999');

        await context.setOffline(false);
        await page.goto(url);
        await expect(price(page, product)).toHaveAttribute('data-price-cents', '2499');
        await expect(page.getByTestId('offline-catalogue-notice')).toHaveCount(0);
      } finally {
        await context.setOffline(false);
        await deleteProduct(request, admin, product.id);
      }
    });

    test('PLS-17.3 defect offline-stale-prices keeps showing the saved price after going back online', async ({
      page,
      context,
      request,
      hooks,
    }) => {
      const bug = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['offline-stale-prices'] } });
      expect(bug.status()).toBe(200);
      const admin = await hooks.createUser('admin');
      const product = await createProduct(request, admin, { priceCents: 1999, stock: 5 });
      try {
        const url = await warmCache(page, product);
        await setPrice(request, admin, product, 2499);

        await context.setOffline(false);
        await page.goto(url);
        await expect(card(page, product)).toBeVisible();
        await expect(price(page, product)).toHaveAttribute('data-price-cents', '1999');
      } finally {
        await deleteProduct(request, admin, product.id);
      }
    });
  });

  test('PLS-17.2 checkout is disabled offline with a message, and works again once back online', async ({ page, context, customer }) => {
    await new LoginPage(page).goto();
    await new LoginPage(page).logIn(customer);
    await page.goto('/products/1');
    await page.getByTestId('add-to-cart-button').click();
    // Leaving before the add finishes would abandon it and show an empty cart.
    await expect(page.getByTestId('cart-count')).toHaveText('1');
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

  test.describe('with service workers blocked', () => {
    test.use({ serviceWorkers: 'block' });

    test('PLS-17.4 the site works normally without offline support', async ({ page, customer }) => {
      await new LoginPage(page).goto();
      await new LoginPage(page).logIn(customer);
      await page.goto('/products');
      await expect(page.getByTestId('product-card').first()).toBeVisible();
      await expect(page.getByTestId('offline-ready')).toHaveCount(0);

      await page.getByTestId('add-to-cart-button').first().click();
      await expect(page.getByTestId('cart-count')).toHaveText('1');
    });
  });
});
