import { CartPage } from '../../pages/CartPage';
import { cards, discounts, product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

const discountProduct = product('EL-001');
const lowPriceProduct = product('SP-003');
const DELIVERY_CENTS = 495;
const VAT_RATE = 0.23;

function seededDiscount(code: string) {
  const result = discounts.seeded.find((entry) => entry.code === code);
  if (!result) throw new Error(`Discount ${code} is missing from tests/shared/discounts.json`);
  return result;
}

function fixtureDiscount(code: string) {
  const result = discounts.fromFixtures.find((entry) => entry.code === code);
  if (!result?.fixture) throw new Error(`Discount fixture for ${code} is missing from tests/shared/discounts.json`);
  return result;
}

const codes = {
  save10: seededDiscount('SAVE10'),
  fixed20: seededDiscount('FIXED20'),
  expired10: fixtureDiscount('EXPIRED10'),
  future10: fixtureDiscount('FUTURE10'),
  used10: fixtureDiscount('USED10'),
  min50: fixtureDiscount('MIN50'),
};
const standardCodes = [codes.save10, codes.fixed20];

async function seedDiscountFixture(request: APIRequestContext, code: string) {
  const { fixture } = fixtureDiscount(code);
  const response = await request.post(`${API_URL}/test/seed`, { data: { fixtures: [fixture] } });
  expect(response.status(), `Seed ${fixture} discount fixture`).toBe(201);
}

async function setBug(request: APIRequestContext, bug: string, enabled: boolean) {
  const response = await request.post(`${API_URL}/test/bugs`, {
    data: enabled ? { enable: [bug] } : { disable: [bug] },
  });
  expect(response.status(), `Set ${bug} defect mode`).toBe(200);
}

async function addProduct(cart: CartPage, productId: number, quantity = 1) {
  const response = await cart.addProduct(productId, quantity);
  expect(response.status()).toBe(201);
  await cart.goto();
}

async function cents(locator: Locator): Promise<number> {
  const value = await locator.getAttribute('data-cents');
  if (value === null) throw new Error('Expected a displayed total with a data-cents attribute');
  const parsed = Number(value);
  expect(Number.isInteger(parsed)).toBe(true);
  return parsed;
}

async function continueToReview(page: Page, cart: CartPage) {
  await cart.checkout.click();
  await page.getByTestId('shipping-full-name').fill('Discount Test Customer');
  await page.getByTestId('shipping-line1').fill('1 Main Street');
  await page.getByTestId('shipping-city').fill('Dublin');
  await page.getByTestId('shipping-postcode').fill('D01 F5P2');
  const inFiveDays = new Date((await page.evaluate(() => Date.now())) + 5 * 86_400_000);
  const deliveryDate = new Date(inFiveDays.getTime() - inFiveDays.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  await page.getByTestId('shipping-delivery-date').fill(deliveryDate);
  await page.getByTestId('shipping-continue-button').click();
}

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function expectedTotals(subtotal: number, code: (typeof standardCodes)[number]) {
  const goodsSaving = code.type === 'percent' ? Math.round((subtotal * code.value) / 100) : Math.min(subtotal, code.value);
  const deliverySaving = code.type === 'fixed' ? Math.min(Math.max(code.value - subtotal, 0), DELIVERY_CENTS) : 0;
  const discountedSubtotal = subtotal - goodsSaving;
  const delivery = DELIVERY_CENTS - deliverySaving;
  return {
    saving: goodsSaving + deliverySaving,
    vat: Math.round(discountedSubtotal * VAT_RATE),
    total: discountedSubtotal + Math.round(discountedSubtotal * VAT_RATE) + delivery,
  };
}

async function verifyDiscountedOrder(
  page: Page,
  request: APIRequestContext,
  customerToken: string,
  adminToken: string,
  scenario: { code: (typeof standardCodes)[number]; product: typeof discountProduct },
) {
  const { code, product: item } = scenario;
  const headers = { Authorization: `Bearer ${adminToken}` };
  const originalProductResponse = await request.get(`${API_URL}/api/v1/products/${item.id}`);
  expect(originalProductResponse.status()).toBe(200);
  const originalProduct: { data: { stock: number } } = await originalProductResponse.json();

  try {
    const cart = new CartPage(page);
    await addProduct(cart, item.id);
    expect((await cart.applyCode(code.code)).status()).toBe(200);
    await continueToReview(page, cart);
    await page.getByTestId('review-continue-button').click();

    const payment = page.frameLocator('[data-testid="payment-frame"]');
    await payment.getByTestId('frame-card-name').fill(cards.defaults.nameOnCard);
    await payment.getByTestId('frame-card-number').fill(cards.success.number);
    await payment.getByTestId('frame-card-expiry').fill(cards.defaults.expiry);
    await payment.getByTestId('frame-card-cvc').fill(cards.defaults.cvc);
    await payment.getByTestId('frame-pay-button').click();
    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    await expect(page.getByTestId('order-discount-code')).toHaveText(code.code);

    const orderNumber = await page.getByTestId('order-number').innerText();
    const orderId = await page.getByTestId('order-summary').getAttribute('data-order-id');
    if (!orderId) throw new Error('The order confirmation is missing its order ID');
    const orderSummary = await request.get(`${API_URL}/api/v1/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    expect(orderSummary.status()).toBe(200);
    const savedOrder: {
      data: { discount: { code: string; amountCents: number }; totals: { totalCents: number } };
    } = await orderSummary.json();
    const expected = expectedTotals(item.priceCents, code);
    expect(savedOrder.data.discount).toEqual({ code: code.code, amountCents: expected.saving });
    expect(savedOrder.data.totals.totalCents).toBe(expected.total);
    await expect(page.getByTestId('order-discount-saving')).toContainText(`€${(expected.saving / 100).toFixed(2)}`);
    await expect(page.getByTestId('totals-total')).toHaveAttribute('data-cents', String(expected.total));

    const exportResponse = await request.get(`${API_URL}/api/v1/orders/export.csv?q=${encodeURIComponent(orderNumber)}`, {
      headers,
    });
    expect(exportResponse.status()).toBe(200);
    expect(exportResponse.headers()['content-type']).toContain('text/csv');
    const rows = (await exportResponse.text()).trim().split(/\r?\n/).map(parseCsvRow);
    const header = rows[0];
    const order = rows.find((row) => row[header.indexOf('number')] === orderNumber);
    expect(order).toBeDefined();
    expect(order?.[header.indexOf('discount_code')]).toBe(code.code);
    expect(order?.[header.indexOf('discount')]).toBe((expected.saving / 100).toFixed(2));
    expect(order?.[header.indexOf('total')]).toBe((expected.total / 100).toFixed(2));
  } finally {
    const currentProductResponse = await request.get(`${API_URL}/api/v1/products/${item.id}`);
    expect(currentProductResponse.status()).toBe(200);
    const etag = currentProductResponse.headers().etag;
    if (!etag) throw new Error('The product response did not include an ETag for stock cleanup');
    const restoredProduct = await request.patch(`${API_URL}/api/v1/products/${item.id}`, {
      headers: { ...headers, 'If-Match': etag },
      data: { stock: originalProduct.data.stock },
    });
    expect(restoredProduct.status()).toBe(200);
  }
}

test.describe('PLS-5 Discount codes', () => {
  for (const code of standardCodes) {
    const ac = code.type === 'percent' ? 'PLS-5.1' : 'PLS-5.11';
    test(`${ac} applying ${code.code} shows the correct saving and recalculated total`, async ({ page }) => {
      const cart = new CartPage(page);
      await addProduct(cart, discountProduct.id);
      const originalTotal = await cents(cart.grandTotal);

      expect((await cart.applyCode(code.code)).status()).toBe(200);

      const expected = expectedTotals(await cents(cart.subtotal), code);
      await expect(cart.discountAppliedCode).toHaveText(code.code);
      await expect(cart.discountSaving).toHaveAttribute('data-cents', String(expected.saving));
      expect(await cents(cart.grandTotal)).toBe(expected.total);
      expect(expected.total).toBeLessThan(originalTotal);
    });

    test(`${ac} detects the discount-not-applied defect for ${code.code}`, async ({ page, request }) => {
      await setBug(request, 'discount-not-applied', true);
      const cart = new CartPage(page);
      await addProduct(cart, discountProduct.id);
      const originalTotal = await cents(cart.grandTotal);

      expect((await cart.applyCode(code.code)).status()).toBe(200);

      await expect(cart.discountAppliedCode).toHaveText(code.code);
      await expect(cart.discountSaving).toHaveCount(0);
      expect(await cents(cart.grandTotal)).toBe(originalTotal);
    });
  }

  test('PLS-5.2 an expired code shows its error and leaves the total unchanged', async ({ page, request }) => {
    await seedDiscountFixture(request, codes.expired10.code);
    const cart = new CartPage(page);
    await addProduct(cart, discountProduct.id);
    const originalTotal = await cents(cart.grandTotal);

    expect((await cart.applyCode(codes.expired10.code)).status()).toBe(422);

    await expect(cart.discountError).toHaveText('This code has expired');
    expect(await cents(cart.grandTotal)).toBe(originalTotal);
  });

  test('PLS-5.2 detects the expired-discount-accepted defect', async ({ page, request }) => {
    await seedDiscountFixture(request, codes.expired10.code);
    await setBug(request, 'expired-discount-accepted', true);
    const cart = new CartPage(page);
    await addProduct(cart, discountProduct.id);
    const originalTotal = await cents(cart.grandTotal);

    expect((await cart.applyCode(codes.expired10.code)).status()).toBe(200);

    await expect(cart.discountAppliedCode).toHaveText(codes.expired10.code);
    expect(await cents(cart.grandTotal)).toBeLessThan(originalTotal);
  });

  test('PLS-5.3 unknown, inactive and used codes show distinct errors without changing the total', async ({
    page,
    request,
  }) => {
    await seedDiscountFixture(request, codes.future10.code);
    await seedDiscountFixture(request, codes.used10.code);
    const cart = new CartPage(page);
    await addProduct(cart, discountProduct.id);
    const originalTotal = await cents(cart.grandTotal);

    for (const [code, message] of [
      ['NOT-A-REAL-CODE', "We don't recognise that code"],
      [codes.future10.code, 'This code is not active yet'],
      [codes.used10.code, 'This code has already been used'],
    ]) {
      expect((await cart.applyCode(code)).status()).toBe(422);
      await expect(cart.discountError).toHaveText(message);
      expect(await cents(cart.grandTotal)).toBe(originalTotal);
    }
  });

  test('PLS-5.3 detects the single-use-reused defect', async ({ page, request }) => {
    await seedDiscountFixture(request, codes.used10.code);
    await setBug(request, 'single-use-reused', true);
    const cart = new CartPage(page);
    await addProduct(cart, discountProduct.id);

    expect((await cart.applyCode(codes.used10.code)).status()).toBe(200);

    await expect(cart.discountAppliedCode).toHaveText(codes.used10.code);
    expect(await cents(cart.discountSaving)).toBeGreaterThan(0);
  });

  test('PLS-5.4 rejects a second code and keeps the first code applied', async ({ page }) => {
    const cart = new CartPage(page);
    await addProduct(cart, discountProduct.id);
    expect((await cart.applyCode(codes.save10.code)).status()).toBe(200);
    const originalSaving = await cents(cart.discountSaving);
    const totalWithFirstCode = await cents(cart.grandTotal);

    expect((await cart.applyCode(codes.fixed20.code)).status()).toBe(409);

    await expect(cart.discountError).toHaveText('Only one code per order');
    await expect(cart.discountAppliedCode).toHaveText(codes.save10.code);
    expect(await cents(cart.discountSaving)).toBe(originalSaving);
    expect(await cents(cart.grandTotal)).toBe(totalWithFirstCode);
  });

  test('PLS-5.4 detects the discount-stacking defect', async ({ page, request }) => {
    await setBug(request, 'discount-stacking', true);
    const cart = new CartPage(page);
    await addProduct(cart, discountProduct.id);
    expect((await cart.applyCode(codes.save10.code)).status()).toBe(200);

    expect((await cart.applyCode(codes.fixed20.code)).status()).toBe(200);

    await expect(cart.discountAppliedCode).toHaveText(`${codes.save10.code} + ${codes.fixed20.code}`);
    expect(await cents(cart.discountSaving)).toBeGreaterThan(0);
  });

  test('PLS-5.5 removes a minimum-spend code when the cart falls below its threshold', async ({ page, request }) => {
    await seedDiscountFixture(request, codes.min50.code);
    const cart = new CartPage(page);
    await addProduct(cart, discountProduct.id, 2);
    expect((await cart.applyCode(codes.min50.code)).status()).toBe(200);
    await expect(cart.discountAppliedCode).toHaveText(codes.min50.code);

    const updated = page.waitForResponse(
      (response) => response.url().includes(`/api/v1/cart/items/${discountProduct.id}`) && response.request().method() === 'PATCH',
    );
    await cart.quantity(discountProduct.id).fill('1');
    await cart.quantity(discountProduct.id).press('Enter');
    expect((await updated).status()).toBe(200);

    await expect(cart.discountAppliedCode).toHaveCount(0);
    await expect(page.getByTestId('cart-notice')).toContainText(`${codes.min50.code} was removed`);
    await expect(cart.discountSaving).toHaveCount(0);
  });

  test('PLS-5.5 detects the discount-survives-cart-change defect', async ({ page, request }) => {
    await seedDiscountFixture(request, codes.min50.code);
    await setBug(request, 'discount-survives-cart-change', true);
    const cart = new CartPage(page);
    await addProduct(cart, discountProduct.id, 2);
    expect((await cart.applyCode(codes.min50.code)).status()).toBe(200);

    const updated = page.waitForResponse(
      (response) => response.url().includes(`/api/v1/cart/items/${discountProduct.id}`) && response.request().method() === 'PATCH',
    );
    await cart.quantity(discountProduct.id).fill('1');
    await cart.quantity(discountProduct.id).press('Enter');
    expect((await updated).status()).toBe(200);

    await expect(cart.discountAppliedCode).toHaveText(codes.min50.code);
    await expect(page.getByTestId('cart-notice')).toHaveCount(0);
  });

  test('PLS-5.6 caps a fixed discount at the cart amount so the total is zero, not negative', async ({ page }) => {
    const cart = new CartPage(page);
    await addProduct(cart, lowPriceProduct.id);

    expect((await cart.applyCode(codes.fixed20.code)).status()).toBe(200);

    await expect(cart.grandTotal).toHaveAttribute('data-cents', '0');
    expect(await cents(cart.grandTotal)).toBeGreaterThanOrEqual(0);
  });

  test('PLS-5.6 detects the discount-negative-total defect', async ({ page, request }) => {
    await setBug(request, 'discount-negative-total', true);
    const cart = new CartPage(page);
    await addProduct(cart, lowPriceProduct.id);

    expect((await cart.applyCode(codes.fixed20.code)).status()).toBe(200);

    expect(await cents(cart.grandTotal)).toBeLessThan(0);
  });

  test('PLS-5.7 accepts lowercase and spaced percentage and fixed-amount codes', async ({ page }) => {
    const cart = new CartPage(page);
    await addProduct(cart, discountProduct.id);

    for (const code of standardCodes) {
      const spacedLowercase = ` ${code.code.toLowerCase().split('').join(' ')} `;
      expect((await cart.applyCode(spacedLowercase)).status()).toBe(200);
      await expect(cart.discountAppliedCode).toHaveText(code.code);
      const removing = page.waitForResponse(
        (response) => response.url().includes('/api/v1/cart/discount') && response.request().method() === 'DELETE',
      );
      await page.getByTestId('discount-remove-button').click();
      expect((await removing).status()).toBe(200);
    }
  });

  for (const code of standardCodes) {
    test(`PLS-5.7 detects the discount-case-sensitive defect for ${code.code}`, async ({ page, request }) => {
      await setBug(request, 'discount-case-sensitive', true);
      const cart = new CartPage(page);
      await addProduct(cart, discountProduct.id);

      expect((await cart.applyCode(code.code.toLowerCase())).status()).toBe(422);

      await expect(cart.discountError).toHaveText("We don't recognise that code");
    });
  }

  for (const code of standardCodes) {
    test(`PLS-5.8 calculates VAT on the ${code.type} discount`, async ({ page }) => {
      const cart = new CartPage(page);
      await addProduct(cart, discountProduct.id);
      expect((await cart.applyCode(code.code)).status()).toBe(200);

      const expected = expectedTotals(await cents(cart.subtotal), code);
      expect(await cents(cart.discountSaving)).toBe(expected.saving);
      expect(await cents(cart.vat)).toBe(expected.vat);
    });

    test(`PLS-5.8 detects vat-before-discount for the ${code.type} discount`, async ({ page, request }) => {
      await setBug(request, 'vat-before-discount', true);
      const cart = new CartPage(page);
      await addProduct(cart, discountProduct.id);
      expect((await cart.applyCode(code.code)).status()).toBe(200);

      expect(await cents(cart.vat)).toBe(Math.round(discountProduct.priceCents * VAT_RATE));
    });
  }

  test('PLS-5.9 discounted confirmation and CSV export show the code and saving', async ({
    page,
    request,
    customer,
    hooks,
  }) => {
    const admin = await hooks.createUser('admin');
    const cart = new CartPage(page);
    const originalProductResponse = await request.get(`${API_URL}/api/v1/products/${discountProduct.id}`);
    expect(originalProductResponse.status()).toBe(200);
    const originalProduct: { data: { stock: number } } = await originalProductResponse.json();
    const originalStock = originalProduct.data.stock;

    try {
      await page.goto('/login');
      await page.getByTestId('login-email').fill(customer.email);
      await page.getByTestId('login-password').fill(customer.password);
      await page.getByTestId('login-submit').click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'));
      await addProduct(cart, discountProduct.id);
      expect((await cart.applyCode(codes.save10.code)).status()).toBe(200);
      await continueToReview(page, cart);
      await page.getByTestId('review-continue-button').click();

      const payment = page.frameLocator('[data-testid="payment-frame"]');
      await payment.getByTestId('frame-card-name').fill(cards.defaults.nameOnCard);
      await payment.getByTestId('frame-card-number').fill(cards.success.number);
      await payment.getByTestId('frame-card-expiry').fill(cards.defaults.expiry);
      await payment.getByTestId('frame-card-cvc').fill(cards.defaults.cvc);
      await payment.getByTestId('frame-pay-button').click();
      await expect(page.getByTestId('order-confirmation')).toBeVisible();
      await expect(page.getByTestId('order-discount-code')).toHaveText(codes.save10.code);

      const orderNumber = await page.getByTestId('order-number').innerText();
      const orderId = await page.getByTestId('order-summary').getAttribute('data-order-id');
      if (!orderId) throw new Error('The order confirmation is missing its order ID');
      const orderSummary = (await request.get(`${API_URL}/api/v1/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${customer.accessToken}` },
      }));
      expect(orderSummary.status()).toBe(200);
      const savedOrder: {
        data: { discount: { code: string; amountCents: number }; totals: { totalCents: number } };
      } = await orderSummary.json();
      const expectedSaving = Math.round((discountProduct.priceCents * codes.save10.value) / 100);
      const discountedSubtotal = discountProduct.priceCents - expectedSaving;
      const expectedTotal = discountedSubtotal + Math.round(discountedSubtotal * VAT_RATE) + DELIVERY_CENTS;
      expect(savedOrder.data.discount).toEqual({ code: codes.save10.code, amountCents: expectedSaving });
      expect(savedOrder.data.totals.totalCents).toBe(expectedTotal);
      await expect(page.getByTestId('order-discount-saving')).toContainText('€5.00');
      await expect(page.getByTestId('totals-total')).toHaveAttribute('data-cents', String(expectedTotal));

      const exportResponse = await request.get(
        `${API_URL}/api/v1/orders/export.csv?q=${encodeURIComponent(orderNumber)}`,
        { headers: { Authorization: `Bearer ${admin.accessToken}` } },
      );
      expect(exportResponse.status()).toBe(200);
      expect(exportResponse.headers()['content-type']).toContain('text/csv');
      const rows = (await exportResponse.text()).trim().split(/\r?\n/).map(parseCsvRow);
      const header = rows[0];
      const order = rows.find((row) => row[header.indexOf('number')] === orderNumber);
      expect(order).toBeDefined();
      expect(order?.[header.indexOf('discount_code')]).toBe(codes.save10.code);
      expect(order?.[header.indexOf('discount')]).toBe((expectedSaving / 100).toFixed(2));
      expect(order?.[header.indexOf('total')]).toBe((expectedTotal / 100).toFixed(2));
    } finally {
      const currentProductResponse = await request.get(`${API_URL}/api/v1/products/${discountProduct.id}`);
      expect(currentProductResponse.status()).toBe(200);
      const etag = currentProductResponse.headers().etag;
      if (!etag) throw new Error('The product response did not include an ETag for stock cleanup');
      const restoredProduct = await request.patch(`${API_URL}/api/v1/products/${discountProduct.id}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}`, 'If-Match': etag },
        data: { stock: originalStock },
      });
      expect(restoredProduct.status()).toBe(200);
    }
  });

  test('PLS-5.9 fixed-discount confirmation and CSV export show the code and exact saving', async ({
    page,
    request,
    customer,
    hooks,
  }) => {
    const admin = await hooks.createUser('admin');
    await page.goto('/login');
    await page.getByTestId('login-email').fill(customer.email);
    await page.getByTestId('login-password').fill(customer.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));

    await verifyDiscountedOrder(page, request, customer.accessToken, admin.accessToken, {
      code: codes.fixed20,
      product: product('EL-002'),
    });
  });

  test('PLS-5.10 the displayed checkout total equals discounted subtotal, VAT and delivery to the cent', async ({
    page,
    customer,
  }) => {
    const cart = new CartPage(page);
    await page.goto('/login');
    await page.getByTestId('login-email').fill(customer.email);
    await page.getByTestId('login-password').fill(customer.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await addProduct(cart, discountProduct.id);
    expect((await cart.applyCode(codes.save10.code)).status()).toBe(200);
    await continueToReview(page, cart);

    const discountedSubtotal = (await cents(cart.subtotal)) - (await cents(cart.discountSaving));
    const expectedTotal = discountedSubtotal + Math.round(discountedSubtotal * VAT_RATE) + DELIVERY_CENTS;
    expect(await cents(cart.grandTotal)).toBe(expectedTotal);
  });

  test('PLS-5.11 the displayed checkout total for a fixed discount is exact', async ({ page, customer }) => {
    const cart = new CartPage(page);
    await page.goto('/login');
    await page.getByTestId('login-email').fill(customer.email);
    await page.getByTestId('login-password').fill(customer.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await addProduct(cart, discountProduct.id);
    expect((await cart.applyCode(codes.fixed20.code)).status()).toBe(200);
    await continueToReview(page, cart);

    const expected = expectedTotals(await cents(cart.subtotal), codes.fixed20);
    expect(await cents(cart.discountSaving)).toBe(expected.saving);
    expect(await cents(cart.vat)).toBe(expected.vat);
    expect(await cents(cart.delivery)).toBe(DELIVERY_CENTS);
    expect(await cents(cart.grandTotal)).toBe(expected.total);
  });
});
