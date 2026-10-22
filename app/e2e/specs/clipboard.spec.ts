import { WEB_URL } from '../env';
import { expect, test } from './fixtures';

test('PLS-15.1 "Copy code" puts the exact code on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB_URL });
  await page.goto('/');
  await page.getByTestId('copy-code-SAVE10').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('SAVE10');
  await expect(page.getByTestId('copy-code-SAVE10-fallback')).toHaveCount(0);
});

test('PLS-15.3 a denied clipboard shows the code selected with "Press Ctrl+C to copy"', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException('Write permission denied', 'NotAllowedError'));
  });
  await page.goto('/');
  await page.getByTestId('copy-code-SAVE10').click();

  const fallback = page.getByTestId('copy-code-SAVE10-fallback');
  await expect(fallback).toHaveValue('SAVE10');
  await expect(fallback).toBeFocused();
  const selected = await fallback.evaluate((el: HTMLInputElement) => el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0));
  expect(selected).toBe('SAVE10');
  await expect(page.getByTestId('copy-code-SAVE10-fallback-hint')).toHaveText('Press Ctrl+C to copy');
});
