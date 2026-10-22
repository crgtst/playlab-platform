import { expect, Page, test as base } from '@playwright/test';
import { API_URL } from '../env';

export const CUSTOMER = { email: 'customer@playlab.test', password: 'Password123!' };

/** Every test starts from the base seed with all defects off. */
export const test = base.extend<{ resetStack: void }>({
  resetStack: [
    async ({ request }, use) => {
      const res = await request.post(`${API_URL}/test/reset`);
      expect(res.ok(), 'POST /test/reset (is TEST_HOOKS=true?)').toBe(true);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

export async function logIn(page: Page, user = CUSTOMER) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

export async function addToCart(page: Page, productId = 1) {
  await page.goto(`/products/${productId}`);
  const added = page.waitForResponse((r) => r.url().includes('/api/v1/cart/items') && r.request().method() === 'POST');
  await page.getByTestId('add-to-cart-button').click();
  expect((await added).ok()).toBe(true);
}

/** From the cart to the payment step, with a delivery date inside the allowed window. */
export async function goToPayment(page: Page) {
  await page.goto('/cart');
  await page.getByTestId('checkout-button').click();
  await page.getByTestId('shipping-full-name').fill('Smoke Test');
  await page.getByTestId('shipping-line1').fill('1 Main Street');
  await page.getByTestId('shipping-city').fill('Dublin');
  await page.getByTestId('shipping-postcode').fill('D01 F5P2');
  const inFiveDays = new Date(Date.now() + 5 * 86_400_000);
  const local = new Date(inFiveDays.getTime() - inFiveDays.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  await page.getByTestId('shipping-delivery-date').fill(local);
  await page.getByTestId('shipping-continue-button').click();
  await page.getByTestId('review-continue-button').click();
}

export async function payWithCard(page: Page, card = '4242 4242 4242 4242') {
  const frame = page.frameLocator('[data-testid="payment-frame"]');
  await frame.getByTestId('frame-card-name').fill('Smoke Test');
  await frame.getByTestId('frame-card-number').fill(card);
  await frame.getByTestId('frame-card-expiry').fill('12/30');
  await frame.getByTestId('frame-card-cvc').fill('123');
  await frame.getByTestId('frame-pay-button').click();
}
