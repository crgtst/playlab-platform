import { API_URL } from '../env';
import { addToCart, expect, goToPayment, logIn, test } from './fixtures';

test("PLS-28.10 the payment frame shows the shop session's defects, and only in that session", async ({ page, context, request }) => {
  const { id } = await (await request.post(`${API_URL}/test/sessions`)).json();
  await request.post(`${API_URL}/test/bugs`, { headers: { 'X-Test-Session': id }, data: { enable: ['button-moves'] } });

  // The browser joins the session through its cookie, as a test would.
  await context.addCookies([{ name: 'test_session', value: id, domain: 'localhost', path: '/' }]);
  await logIn(page);
  await addToCart(page);
  await goToPayment(page);
  const frame = page.frameLocator('[data-testid="payment-frame"]');
  await expect(frame.getByTestId('frame-late-banner')).toBeVisible();
  expect(new URL((await page.getByTestId('payment-frame').getAttribute('src'))!).searchParams.get('testSession')).toBe(id);

  // The same checkout with no session: no defect.
  await context.clearCookies({ name: 'test_session' });
  await goToPayment(page);
  await expect(frame.getByTestId('frame-pay-button')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(frame.getByTestId('frame-late-banner')).toHaveCount(0);
});
