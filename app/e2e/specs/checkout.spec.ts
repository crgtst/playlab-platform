import { API_PORT, API_URL, WEB_PORT } from '../env';
import { addToCart, CUSTOMER, expect, goToPayment, logIn, payWithCard, test } from './fixtures';

test('PLS-6.1 a customer checks out with card 4242 and sees the confirmation', async ({ page }) => {
  await logIn(page);
  await addToCart(page);
  await goToPayment(page);
  await payWithCard(page);
  await expect(page.getByTestId('order-confirmation-message')).toHaveText(/Your order PL-\d{6} has been placed/);
});

test('PLS-12.5 the payment frame and the reset link follow the host ports', async ({ page, request }) => {
  await logIn(page);
  await addToCart(page);
  await goToPayment(page);
  const frameSrc = await page.getByTestId('payment-frame').getAttribute('src');
  expect(new URL(frameSrc!).port).toBe(API_PORT);
  await payWithCard(page);
  await expect(page.getByTestId('order-confirmation')).toBeVisible();

  await request.post(`${API_URL}/api/v1/auth/forgot-password`, { data: { email: CUSTOMER.email } });
  const mailbox = await (await request.get(`${API_URL}/test/mailbox/${CUSTOMER.email}`)).json();
  expect(new URL(mailbox.data[0].link).port).toBe(WEB_PORT);
});
