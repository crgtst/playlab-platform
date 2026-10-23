import { CartPage } from '../../pages/CartPage';
import { CheckoutPage } from '../../pages/CheckoutPage';
import { cards, product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';
import type { APIRequestContext, Page } from '@playwright/test';

const checkoutProduct = product('EL-001');
const ordersUrl = `${API_URL}/api/v1/orders`;
const cardDetails = (number: string) => ({
  nameOnCard: 'Casey Customer',
  cardNumber: number.replaceAll(' ', ''),
  expiry: '12/30',
  cvc: '123',
});

interface Order {
  id: number;
  number: string;
  items: { productId: number; unitPriceCents: number; quantity: number }[];
  totals: { subtotalCents: number; totalCents: number };
}

async function logIn(page: Page, customer: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(customer.email);
  await page.getByTestId('login-password').fill(customer.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function addCheckoutProduct(page: Page, customer: { email: string; password: string }) {
  await logIn(page, customer);
  const cart = new CartPage(page);
  const added = await cart.addProduct(checkoutProduct.id);
  expect(added.status()).toBe(201);
  await cart.goto();
  await cart.checkout.click();
  await expect(page.getByTestId('checkout-step-1')).toBeVisible();
  return new CheckoutPage(page);
}

async function customerOrders(request: APIRequestContext, accessToken: string): Promise<{ data: Order[]; total: number }> {
  const response = await request.get(`${ordersUrl}?limit=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { data: Order[]; meta: { total: number } };
  return { data: body.data, total: body.meta.total };
}

async function removeOrdersSince(request: APIRequestContext, accessToken: string, originalIds: Set<number>) {
  const current = await customerOrders(request, accessToken);
  for (const order of current.data) {
    if (originalIds.has(order.id)) continue;
    const response = await request.post(`${ordersUrl}/${order.id}/cancel`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(response.status(), `Cancel test order ${order.number} and restore its stock`).toBe(200);
  }
}

async function captureExistingOrderIds(request: APIRequestContext, accessToken: string) {
  const existing = await customerOrders(request, accessToken);
  return new Set(existing.data.map((order) => order.id));
}

async function setBug(request: APIRequestContext, bug: string) {
  const response = await request.post(`${API_URL}/test/bugs`, { data: { enable: [bug] } });
  expect(response.status(), `Enable ${bug} defect mode`).toBe(200);
}

async function startCheckout(page: Page, customer: { email: string; password: string }) {
  const checkout = await addCheckoutProduct(page, customer);
  await checkout.fillShipping();
  await checkout.shippingContinue.click();
  await expect(page.getByTestId('checkout-step-2')).toBeVisible();
  await checkout.reviewContinue.click();
  await expect(page.getByTestId('checkout-step-3')).toBeVisible();
  await checkout.paymentFrame.getByTestId('frame-card-number').waitFor();
  return checkout;
}

async function sendTabUntil(page: Page, testId: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    if (focused === testId) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Could not reach ${testId} by pressing Tab`);
}

async function sendTabUntilPaymentField(page: Page, checkout: CheckoutPage, testId: string) {
  const field = checkout.paymentFrame.getByTestId(testId);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await field.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Could not reach the payment field ${testId} by pressing Tab`);
}

test.describe('PLS-6 Checkout and payment', () => {
  test('PLS-6.1 completing all three checkout steps with the success card shows an order number', async ({ page, request, customer }) => {
    const existingIds = await captureExistingOrderIds(request, customer.accessToken);
    try {
      const checkout = await startCheckout(page, customer);
      const paymentResponse = await checkout.pay(cards.success.number);
      expect(paymentResponse.status()).toBe(200);
      await expect(page.getByTestId('order-confirmation')).toBeVisible();
      await expect(page.getByTestId('order-number')).toHaveText(/PL-\d{6}/);

      const orders = await customerOrders(request, customer.accessToken);
      expect(orders.total).toBe(1);
      expect(orders.data[0].number).toMatch(/^PL-\d{6}$/);
    } finally {
      await removeOrdersSince(request, customer.accessToken, existingIds);
    }
  });

  test('PLS-6.2 a declined card returns 402, shows the decline and keeps the cart', async ({ page, request, customer }) => {
    const existingIds = await captureExistingOrderIds(request, customer.accessToken);
    try {
      const checkout = await startCheckout(page, customer);
      const paymentResponse = await checkout.pay(cards.decline.number);

      expect(paymentResponse.status()).toBe(402);
      await expect(page.getByTestId('payment-declined')).toContainText('Your card was declined');
      const orders = await customerOrders(request, customer.accessToken);
      expect(orders.total).toBe(0);
      const cartResponse = await request.get(`${API_URL}/api/v1/cart`, {
        headers: { Authorization: `Bearer ${customer.accessToken}` },
      });
      expect(cartResponse.status()).toBe(200);
      const cart = (await cartResponse.json()) as { items: { productId: number; quantity: number }[] };
      expect(cart.items).toMatchObject([{ productId: checkoutProduct.id, quantity: 1 }]);
    } finally {
      await removeOrdersSince(request, customer.accessToken, existingIds);
    }
  });

  test('PLS-6.3 a timeout shows a retry option and creates no order', async ({ page, request, customer }) => {
    const existingIds = await captureExistingOrderIds(request, customer.accessToken);
    try {
      const checkout = await startCheckout(page, customer);
      const paymentResponse = await checkout.pay(cards.timeout.number);

      expect(paymentResponse.status()).toBe(504);
      await expect(page.getByTestId('payment-timeout')).toBeVisible();
      await expect(page.getByTestId('payment-retry-button')).toBeEnabled();
      const orders = await customerOrders(request, customer.accessToken);
      expect(orders.total).toBe(0);
    } finally {
      await removeOrdersSince(request, customer.accessToken, existingIds);
    }
  });

  test('PLS-6.4 double-clicking Pay creates exactly one order', async ({ page, request, customer }) => {
    const existingIds = await captureExistingOrderIds(request, customer.accessToken);
    try {
      const checkout = await startCheckout(page, customer);
      await checkout.fillCard(cards.success.number);
      const confirmation = page.waitForResponse(
        (response) => response.url().includes('/api/v1/orders') && response.request().method() === 'POST',
      );
      await checkout.paymentFrame.getByTestId('frame-pay-button').dblclick();
      await confirmation;
      await expect(page.getByTestId('order-confirmation')).toBeVisible();

      const orders = await customerOrders(request, customer.accessToken);
      expect(orders.total).toBe(1);
    } finally {
      await removeOrdersSince(request, customer.accessToken, existingIds);
    }
  });

  test('PLS-6.4 detects the double-submit defect', async ({ page, request, customer }) => {
    const existingIds = await captureExistingOrderIds(request, customer.accessToken);
    try {
      await setBug(request, 'double-submit');
      const checkout = await startCheckout(page, customer);
      await checkout.pay(cards.success.number);
      await expect(page.getByTestId('order-confirmation')).toBeVisible();

      await expect.poll(async () => (await customerOrders(request, customer.accessToken)).total).toBe(2);
    } finally {
      await removeOrdersSince(request, customer.accessToken, existingIds);
    }
  });

  test('PLS-6.5 browser back after payment does not submit another order', async ({ page, request, customer }) => {
    const existingIds = await captureExistingOrderIds(request, customer.accessToken);
    try {
      const checkout = await startCheckout(page, customer);
      await checkout.pay(cards.success.number);
      await expect(page.getByTestId('order-confirmation')).toBeVisible();
      await page.goBack();
      await expect(page).not.toHaveURL(/\/checkout\/payment$/);
      expect((await customerOrders(request, customer.accessToken)).total).toBe(1);
    } finally {
      await removeOrdersSince(request, customer.accessToken, existingIds);
    }
  });

  test('PLS-6.6 navigating away during checkout shows the leave warning', async ({ page, customer }) => {
    await startCheckout(page, customer);
    const dialogPromise = page.waitForEvent('dialog');
    const navigation = page.getByTestId('nav-home').click();
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toBe('Your order is not finished. Leave checkout?');
    await dialog.dismiss();
    await navigation;
    await expect(page).toHaveURL(/\/checkout\/payment$/);
  });

  test('PLS-6.6 a browser-level navigation also triggers the beforeunload warning', async ({ page, customer }) => {
    await startCheckout(page, customer);
    const dialogPromise = page.waitForEvent('dialog');
    const navigation = page.goto('/cart').catch((error: Error) => error);
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
    const navigationResult = await navigation;
    expect(navigationResult).toBeInstanceOf(Error);
    expect(String(navigationResult)).toContain('ERR_ABORTED');
    await expect(page).toHaveURL(/\/checkout\/payment$/);
  });

  test('PLS-6.7 the API ignores a client price and stores the catalogue price', async ({ page, request, customer }) => {
    const existingIds = await captureExistingOrderIds(request, customer.accessToken);
    try {
      await logIn(page, customer);
      const cart = new CartPage(page);
      expect((await cart.addProduct(checkoutProduct.id)).status()).toBe(201);

      const response = await request.post(ordersUrl, {
        headers: { Authorization: `Bearer ${customer.accessToken}` },
        data: {
          shipping: { fullName: 'Price Integrity Tester', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2' },
          deliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
          payment: cardDetails(cards.success.number),
          items: [{ productId: checkoutProduct.id, unitPriceCents: 1 }],
        },
      });
      expect(response.status()).toBe(201);
      const body = (await response.json()) as { data: Order };
      expect(body.data.items[0].unitPriceCents).toBe(checkoutProduct.priceCents);
      expect(body.data.totals.subtotalCents).toBe(checkoutProduct.priceCents);
    } finally {
      await removeOrdersSince(request, customer.accessToken, existingIds);
    }
  });

  test('PLS-6.7 detects the price-tamper defect', async ({ page, request, customer }) => {
    const existingIds = await captureExistingOrderIds(request, customer.accessToken);
    try {
      await setBug(request, 'price-tamper');
      await logIn(page, customer);
      const cart = new CartPage(page);
      expect((await cart.addProduct(checkoutProduct.id)).status()).toBe(201);

      const response = await request.post(ordersUrl, {
        headers: { Authorization: `Bearer ${customer.accessToken}` },
        data: {
          shipping: { fullName: 'Price Tamper Tester', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2' },
          deliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
          payment: cardDetails(cards.success.number),
          items: [{ productId: checkoutProduct.id, unitPriceCents: 1 }],
        },
      });
      expect(response.status()).toBe(201);
      const body = (await response.json()) as { data: Order };
      expect(body.data.items[0].unitPriceCents).toBe(1);
      expect(body.data.totals.subtotalCents).toBe(1);
    } finally {
      await removeOrdersSince(request, customer.accessToken, existingIds);
    }
  });

  test('PLS-6.8 the Pay button remains in place after the payment frame loads', async ({ page, customer }) => {
    const checkout = await startCheckout(page, customer);
    const payButton = checkout.paymentFrame.getByTestId('frame-pay-button');
    const before = await payButton.evaluate((element) => {
      const { x, y } = element.getBoundingClientRect();
      return { x, y };
    });
    await page.waitForTimeout(750);
    const after = await payButton.evaluate((element) => {
      const { x, y } = element.getBoundingClientRect();
      return { x, y };
    });
    expect(after).toEqual(before);
  });

  test('PLS-6.8 detects the button-moves defect', async ({ page, request, customer }) => {
    await setBug(request, 'button-moves');
    const checkout = await startCheckout(page, customer);
    const payButton = checkout.paymentFrame.getByTestId('frame-pay-button');
    const before = await payButton.evaluate((element) => element.getBoundingClientRect().y);
    await expect(checkout.paymentFrame.getByTestId('frame-late-banner')).toBeVisible();
    const after = await payButton.evaluate((element) => element.getBoundingClientRect().y);
    expect(after).toBeGreaterThan(before);
  });

  test('PLS-6.9 keyboard-only input completes all three checkout steps', async ({ page, request, customer }) => {
    const existingIds = await captureExistingOrderIds(request, customer.accessToken);
    try {
      await addCheckoutProduct(page, customer);

      await sendTabUntil(page, 'shipping-full-name');
      await page.keyboard.type('Keyboard Checkout Customer');
      await sendTabUntil(page, 'shipping-line1');
      await page.keyboard.type('1 Main Street');
      await page.keyboard.press('Escape');
      await sendTabUntil(page, 'shipping-city');
      await page.keyboard.type('Dublin');
      await sendTabUntil(page, 'shipping-postcode');
      await page.keyboard.type('D01 F5P2');
      await sendTabUntil(page, 'shipping-delivery-date');
      const deliveryDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      await page.getByTestId('shipping-delivery-date').fill(deliveryDate);
      await sendTabUntil(page, 'shipping-continue-button');
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('checkout-step-2')).toBeVisible();

      await sendTabUntil(page, 'review-continue-button');
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('checkout-step-3')).toBeVisible();
      await checkoutKeyboardPay(page);
      await expect(page.getByTestId('order-confirmation')).toBeVisible();
    } finally {
      await removeOrdersSince(request, customer.accessToken, existingIds);
    }
  });
});

async function checkoutKeyboardPay(page: Page) {
  const checkout = new CheckoutPage(page);
  await checkout.paymentFrame.getByTestId('frame-card-name').waitFor();

  await sendTabUntilPaymentField(page, checkout, 'frame-card-name');
  await page.keyboard.type('Casey Customer');
  await page.keyboard.press('Tab');
  await page.keyboard.type(cards.success.number);
  await page.keyboard.press('Tab');
  await page.keyboard.type('12/30');
  await page.keyboard.press('Tab');
  await page.keyboard.type('123');
  await page.keyboard.press('Tab');
  const response = page.waitForResponse(
    (result) => /\/pay\/intents\/[^/]+\/confirm(?:\?|$)/.test(result.url()) && result.request().method() === 'POST',
  );
  await page.keyboard.press('Enter');

  expect((await response).status()).toBe(200);
}
