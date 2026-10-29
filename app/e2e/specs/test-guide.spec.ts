import { API_URL, WEB_URL } from '../env';
import { expect, logIn, test } from './fixtures';

test('PLS-12.7 the footer links to a Test guide with the accounts, cards, scenarios and defects', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('footer-test-guide-link').click();

  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Test guide' })).toBeVisible();
  await expect(page.getByTestId('guide-accounts').getByRole('row')).toHaveCount(4); // header + customer, admin, support
  await expect(page.getByTestId('guide-cards')).toContainText('4242 4242 4242 4242');
  await expect(page.getByTestId('guide-discounts')).toContainText('SAVE10');
  await expect(page.getByTestId('guide-fixtures')).toContainText('expired-discount');
  await expect(page.getByTestId('guide-scenarios').locator('details')).not.toHaveCount(0);
  await expect(page.getByTestId('guide-bug')).toHaveCount(47);
  await expect(page.getByTestId('guide-links').getByRole('link', { name: 'API docs (Swagger)' })).toHaveAttribute('href', '/api/docs');
  await expect(page.getByTestId('guide-links').getByRole('link', { name: 'Test mailbox' })).toHaveAttribute('href', '/mailbox');
});

test('PLS-12.7 the account the guide shows can log in, and its copy buttons copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB_URL });
  await page.goto('/guide');
  const row = page.getByTestId('guide-accounts').getByRole('row', { name: /customer/ });
  const email = (await row.locator('code').nth(0).textContent()) ?? '';
  const password = (await row.locator('code').nth(1).textContent()) ?? '';

  await page.getByTestId('guide-copy-password-customer').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(password);

  await logIn(page, { email, password });
  await expect(page.getByTestId('header-user-name')).toHaveText('Casey Customer');
});

test('PLS-12.7 a defect that is switched on shows as On', async ({ page, request }) => {
  const on = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['order-leak'] } });
  expect(on.ok()).toBe(true);
  try {
    await page.goto('/guide');
    const rows = page.getByTestId('guide-bug');
    await expect(rows.filter({ hasText: 'order-leak' })).toHaveAttribute('data-enabled', 'true');
    await expect(rows.filter({ hasText: 'order-leak' })).toContainText('On');
    await expect(page.locator('[data-testid="guide-bug"][data-enabled="true"]')).toHaveCount(1);
  } finally {
    await request.delete(`${API_URL}/test/bugs`);
  }
});

test('PLS-12.7 with test hooks off there is no footer link, and the page says it is not available', async ({ page }) => {
  await page.route('**/api/v1/config', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), testHooks: false } });
  });
  await page.route('**/test/guide', (route) =>
    route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not found' } } }),
  );

  await page.goto('/');
  await expect(page.getByTestId('footer-api-docs-link')).toBeVisible();
  await expect(page.getByTestId('footer-test-guide-link')).toHaveCount(0);

  await page.goto('/guide');
  await expect(page.getByTestId('guide-error')).toHaveText('Test hooks are switched off, so the test guide is not available.');
});
