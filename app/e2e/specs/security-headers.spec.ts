import { WEB_URL } from '../env';
import { addToCart, expect, goToPayment, logIn, payWithCard, test } from './fixtures';

test('PLS-24.11 the web app sends the security headers on its pages and files', async ({ request }) => {
  for (const path of ['/', '/products', '/favicon.svg', '/sw.js']) {
    const res = await request.get(`${WEB_URL}${path}`);
    expect(res.headers()['x-content-type-options'], path).toBe('nosniff');
    expect(res.headers()['referrer-policy'], path).toBeTruthy();
    expect(res.headers()['permissions-policy'], path).toBeTruthy();
    expect(res.headers()['content-security-policy'], path).toContain("default-src 'self'");
  }
});

test('PLS-24.11 the policy blocks nothing the shop needs: no violations on the main pages, and checkout still pays', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (/Content Security Policy/i.test(error.message)) violations.push(error.message);
  });
  await page.goto('/');
  await page.goto('/products');
  await page.goto('/stores');
  await page.goto('/login');
  await logIn(page);
  await addToCart(page);
  await goToPayment(page);
  await payWithCard(page);
  await expect(page.getByTestId('order-confirmation')).toBeVisible();
  expect(violations).toEqual([]);
});
