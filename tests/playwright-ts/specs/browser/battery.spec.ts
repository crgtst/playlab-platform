import { changeBattery, mockBattery, removeBattery } from '../../support/browser';
import { API_URL, expect, test } from '../../support/fixtures';

test.describe('PLS-16 Battery-saver banner', () => {
  test('PLS-16.1 below 20% and not charging shows the banner and stops CSS animations', async ({ page }) => {
    await mockBattery(page, { level: 0.15, charging: false });
    await page.goto('/');

    const banner = page.getByTestId('battery-banner');
    await expect(banner).toHaveText(/Low battery: animations paused/);
    await expect(page.locator('html')).toHaveAttribute('data-battery-saver', 'on');
    // Animations are switched off for every element, not just hidden behind the banner.
    const animated = await page.evaluate(
      () => Array.from(document.querySelectorAll('*')).filter((el) => getComputedStyle(el).animationName !== 'none').length,
    );
    expect(animated).toBe(0);
  });

  test('PLS-16.1 a battery that is low but charging, or healthy, shows no banner', async ({ page }) => {
    await mockBattery(page, { level: 0.15, charging: true });
    await page.goto('/');
    await expect(page.getByTestId('offers-strip')).toBeVisible();
    await expect(page.getByTestId('battery-banner')).toHaveCount(0);

    await changeBattery(page, { level: 0.8, charging: false });
    await expect(page.getByTestId('battery-banner')).toHaveCount(0);
  });

  test('PLS-16.2 the banner disappears within 2 seconds of charging starting', async ({ page }) => {
    await mockBattery(page, { level: 0.1, charging: false });
    await page.goto('/');
    await expect(page.getByTestId('battery-banner')).toBeVisible();

    await changeBattery(page, { charging: true });
    await expect(page.getByTestId('battery-banner')).toHaveCount(0, { timeout: 2000 });
    await expect(page.locator('html')).toHaveAttribute('data-battery-saver', 'off');
  });

  test('PLS-16.2 defect battery-banner-stuck keeps the banner after charging starts', async ({ page, request }) => {
    const bug = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['battery-banner-stuck'] } });
    expect(bug.status()).toBe(200);
    await mockBattery(page, { level: 0.1, charging: false });
    await page.goto('/');
    await expect(page.getByTestId('battery-banner')).toBeVisible();

    await changeBattery(page, { charging: true });
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('battery-banner')).toBeVisible();
  });

  test('PLS-16.3 without the Battery API no banner shows and no console error is logged', async ({ page }) => {
    const problems: string[] = [];
    // A guest's session check is answered with 401 on every page load; that is not the battery code failing.
    page.on('console', (message) => {
      if (message.type() === 'error' && !/status of 401/.test(message.text())) problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    await removeBattery(page);
    await page.goto('/');

    await expect(page.getByTestId('offers-strip')).toBeVisible();
    await expect(page.getByTestId('battery-banner')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
