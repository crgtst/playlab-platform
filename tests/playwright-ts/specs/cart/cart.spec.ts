import { CartPage } from '../../pages/CartPage';
import { product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';
import type { APIRequestContext } from '@playwright/test';

const firstProduct = product('EL-001');
const threeStockProduct = product('EL-006');
const priceChangeProduct = product('SP-001');
const roundingProductIds = ['EL-001', 'EL-002', 'EL-003'].map((sku) => product(sku).id);
const cartApi = `${API_URL}/api/v1/cart`;

async function setBug(request: APIRequestContext, bug: string, enabled: boolean) {
  const response = await request.post(`${API_URL}/test/bugs`, {
    data: enabled ? { enable: [bug] } : { disable: [bug] },
  });
  expect(response.status(), `Set ${bug} defect mode`).toBe(200);
}

async function addThreeProducts(cart: CartPage) {
  for (const id of roundingProductIds) {
    const response = await cart.addProduct(id);
    expect(response.status()).toBe(201);
  }
  await cart.goto();
  await expect(cart.items).toHaveCount(roundingProductIds.length);
}

test.describe('PLS-4 Shopping cart', () => {
  test('PLS-4.1 adding an in-stock product updates the cart count and subtotal', async ({ page }) => {
    const cart = new CartPage(page);
    const response = await cart.addProduct(firstProduct.id);
    expect(response.status()).toBe(201);
    await cart.goto();

    await expect(page.getByTestId('cart-count')).toHaveText('1');
    await expect(cart.subtotal).toHaveAttribute('data-cents', String(firstProduct.priceCents));
  });

  test('PLS-4.2 zero and negative quantities are rejected without changing the previous quantity', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addProduct(firstProduct.id);
    await cart.goto();

    for (const invalid of ['0', '-1']) {
      const quantity = cart.quantity(firstProduct.id);
      await quantity.fill(invalid);
      await quantity.press('Enter');
      await expect(quantity).toHaveValue('1');
      await expect(page.getByTestId('cart-item-error')).toHaveText('Quantity must be at least 1');
    }
  });

  test('PLS-4.2 detects the quantity-negative defect reaching the cart API', async ({ page, request }) => {
    await setBug(request, 'quantity-negative', true);
    const cart = new CartPage(page);
    await cart.addProduct(firstProduct.id);
    await cart.goto();
    const update = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/v1/cart/items/${firstProduct.id}`) && response.request().method() === 'PATCH',
    );
    await cart.quantity(firstProduct.id).fill('0');
    await cart.quantity(firstProduct.id).press('Enter');
    expect((await update).status()).toBe(200);
    await expect(cart.quantity(firstProduct.id)).toHaveValue('0');
  });

  test('PLS-4.3 requesting more than available stock shows the stock error and returns 409', async ({ page }) => {
    const cart = new CartPage(page);
    const response = await cart.addProduct(threeStockProduct.id, 3);
    expect(response.status()).toBe(201);
    await cart.goto();

    const update = page.waitForResponse(
      (result) =>
        result.url().includes(`/api/v1/cart/items/${threeStockProduct.id}`) && result.request().method() === 'PATCH',
    );
    await cart.quantity(threeStockProduct.id).fill('4');
    await cart.quantity(threeStockProduct.id).press('Enter');

    expect((await update).status()).toBe(409);
    await expect(page.getByTestId('cart-item-error')).toHaveText(`Only ${threeStockProduct.stock} left`);
    await expect(cart.quantity(threeStockProduct.id)).toHaveValue(String(threeStockProduct.stock));
  });

  test('PLS-4.3 detects the stock-oversell defect', async ({ page, request }) => {
    await setBug(request, 'stock-oversell', true);
    const cart = new CartPage(page);
    const response = await cart.addProduct(threeStockProduct.id, threeStockProduct.stock + 1);
    expect(response.status()).toBe(201);
    await cart.goto();
    await expect(cart.quantity(threeStockProduct.id)).toHaveValue(String(threeStockProduct.stock + 1));
  });

  test('PLS-4.4 subtotal equals the sum of line totals to the cent', async ({ page }) => {
    const cart = new CartPage(page);
    await addThreeProducts(cart);
    const lineTotalCents = await page.getByTestId('cart-item-line-total').evaluateAll((totals) =>
      totals.reduce((sum, total) => sum + Number(total.getAttribute('data-cents')), 0),
    );
    await expect(cart.subtotal).toHaveAttribute('data-cents', String(lineTotalCents));
  });

  test('PLS-4.4 detects the cart-total-rounding defect', async ({ page, request }) => {
    await setBug(request, 'cart-total-rounding', true);
    const cart = new CartPage(page);
    await addThreeProducts(cart);
    const lineTotalCents = await page.getByTestId('cart-item-line-total').evaluateAll((totals) =>
      totals.reduce((sum, total) => sum + Number(total.getAttribute('data-cents')), 0),
    );
    await expect(cart.subtotal).toHaveAttribute('data-cents', String(lineTotalCents + 1));
  });

  test('PLS-4.5 guest cart merges with the account cart without doubling quantities', async ({
    page,
    request,
    customer,
  }) => {
    const authHeaders = { Authorization: `Bearer ${customer.accessToken}` };
    const accountAdd = await request.post(`${cartApi}/items`, {
      headers: authHeaders,
      data: { productId: firstProduct.id, quantity: 2 },
    });
    expect(accountAdd.status()).toBe(201);

    const cart = new CartPage(page);
    const guestAdd = await cart.addProduct(firstProduct.id);
    expect(guestAdd.status()).toBe(201);
    await page.goto('/login');
    await page.getByTestId('login-email').fill(customer.email);
    await page.getByTestId('login-password').fill(customer.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await cart.goto();

    await expect(cart.quantity(firstProduct.id)).toHaveValue('2');
  });

  test('PLS-4.6 switching EUR to GBP updates cart prices', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addProduct(firstProduct.id);
    await cart.goto();
    await page.getByTestId('currency-select').selectOption('GBP');
    const linePrice = page.getByTestId('cart-item-price');
    await expect(linePrice).toContainText('£');
    const displayedTotals = await page.locator('[data-testid^="totals-"]').allTextContents();
    expect(displayedTotals.length).toBeGreaterThan(0);
    for (const total of displayedTotals) expect(total).toContain('£');
    await expect(linePrice).toHaveAttribute('data-cents', String(firstProduct.priceCents));
  });

  test('PLS-4.6 detects the currency-switch-stale defect', async ({ page, request }) => {
    await setBug(request, 'currency-switch-stale', true);
    const cart = new CartPage(page);
    await cart.addProduct(firstProduct.id);
    await cart.goto();
    await page.getByTestId('currency-select').selectOption('GBP');
    await expect(page.getByTestId('cart-item-price')).toContainText('€');
    await expect(cart.subtotal).toContainText('€');
  });

  test('PLS-4.7 warns when a product price changes before payment', async ({ page, hooks, request, customer }) => {
    const admin = await hooks.createUser('admin');
    const headers = { Authorization: `Bearer ${admin.accessToken}` };
    const productId = priceChangeProduct.id;
    const productResponse = await request.get(`${API_URL}/api/v1/products/${productId}`);
    expect(productResponse.status()).toBe(200);
    const etag = productResponse.headers().etag;
    if (!etag) throw new Error('The seeded product response did not include an ETag');

    try {
      await page.goto('/login');
      await page.getByTestId('login-email').fill(customer.email);
      await page.getByTestId('login-password').fill(customer.password);
      await page.getByTestId('login-submit').click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'));

      const cart = new CartPage(page);
      expect((await cart.addProduct(productId)).status()).toBe(201);
      const changedProduct = await request.patch(`${API_URL}/api/v1/products/${productId}`, {
        headers: { ...headers, 'If-Match': etag },
        data: { priceCents: priceChangeProduct.priceCents + 1 },
      });
      expect(changedProduct.status()).toBe(200);

      await cart.goto();
      await cart.checkout.click();
      await page.getByTestId('shipping-full-name').fill('Price Change Tester');
      await page.getByTestId('shipping-line1').fill('1 Main Street');
      await page.getByTestId('shipping-city').fill('Dublin');
      await page.getByTestId('shipping-postcode').fill('D01 F5P2');
      const deliveryDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      await page.getByTestId('shipping-delivery-date').fill(deliveryDate);
      await page.getByTestId('shipping-continue-button').click();
      await expect(page.getByTestId('price-change-warning')).toBeVisible();
      await page.getByTestId('price-change-accept-button').click();
      await page.getByTestId('review-continue-button').click();
      await expect(page.getByTestId('price-change-warning')).toBeVisible();
      await expect(page.getByTestId('price-change-accepted')).toBeVisible();
    } finally {
      const currentProduct = await request.get(`${API_URL}/api/v1/products/${productId}`);
      expect(currentProduct.status()).toBe(200);
      const currentEtag = currentProduct.headers().etag;
      if (!currentEtag) throw new Error('The updated product response did not include an ETag');
      const restoredProduct = await request.patch(`${API_URL}/api/v1/products/${productId}`, {
        headers: { ...headers, 'If-Match': currentEtag },
        data: { priceCents: priceChangeProduct.priceCents },
      });
      expect(restoredProduct.status()).toBe(200);
    }
  });
});
