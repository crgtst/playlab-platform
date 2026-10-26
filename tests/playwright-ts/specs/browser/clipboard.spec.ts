import { LoginPage } from '../../pages/LoginPage';
import { discounts } from '../../support/data';
import { WEB_URL } from '../../support/env';
import { API_URL, expect, test } from '../../support/fixtures';
import { cancelOrder, createOrder } from '../../support/orders';
import type { APIRequestContext, Page } from '@playwright/test';

const percentCode = discounts.seeded.find((d) => d.type === 'percent')!.code;
const fixedCode = discounts.seeded.find((d) => d.type === 'fixed')!.code;

async function setBug(request: APIRequestContext, bug: string) {
  const response = await request.post(`${API_URL}/test/bugs`, { data: { enable: [bug] } });
  expect(response.status(), `Enable ${bug} defect mode`).toBe(200);
}

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test.describe('PLS-15 Copy to clipboard', () => {
  test('PLS-15.1 "Copy code" puts that exact code on the clipboard and shows a "Copied" toast', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB_URL });
    await page.goto('/');

    for (const code of [percentCode, fixedCode]) {
      await page.getByTestId(`copy-code-${code}`).click();
      expect(await clipboard(page)).toBe(code);
      await expect(page.getByTestId('toast-message').filter({ hasText: `Copied ${code}` })).toBeVisible();
      await expect(page.getByTestId(`copy-code-${code}`)).toHaveText('Copied');
    }
  });

  test('PLS-15.1 defect clipboard-wrong-value copies the previous code', async ({ page, request, context }) => {
    await setBug(request, 'clipboard-wrong-value');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB_URL });
    await page.goto('/');

    await page.getByTestId(`copy-code-${percentCode}`).click();
    await expect(page.getByTestId('toast-message').filter({ hasText: `Copied ${percentCode}` })).toBeVisible();
    expect(await clipboard(page)).not.toBe(percentCode);
  });

  test('PLS-15.2 "Copy order number" puts the order number on the clipboard', async ({ page, request, context, hooks, customer }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB_URL });
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, 'CL-003');
    try {
      await new LoginPage(page).goto();
      await new LoginPage(page).logIn(customer);
      await page.goto(`/orders/${order.id}/confirmation`);

      await page.getByTestId('copy-order-number-button').click();
      expect(await clipboard(page)).toBe(order.number);
    } finally {
      await cancelOrder(request, admin, order);
    }
  });

  test('PLS-15.3 a denied clipboard shows the code selected with "Press Ctrl+C to copy"', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.clipboard.writeText = () => Promise.reject(new DOMException('Write permission denied', 'NotAllowedError'));
    });
    await page.goto('/');
    await page.getByTestId(`copy-code-${percentCode}`).click();

    const fallback = page.getByTestId(`copy-code-${percentCode}-fallback`);
    await expect(fallback).toHaveValue(percentCode);
    const selected = await fallback.evaluate((el: HTMLInputElement) => el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0));
    expect(selected).toBe(percentCode);
    await expect(page.getByTestId(`copy-code-${percentCode}-fallback-hint`)).toHaveText('Press Ctrl+C to copy');
  });
});
