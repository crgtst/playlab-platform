import { StoresPage } from '../../pages/StoresPage';
import { API_URL, expect, test } from '../../support/fixtures';
import type { APIRequestContext } from '@playwright/test';

const GALWAY = { latitude: 53.2724, longitude: -9.0532 };
const CORK = { latitude: 51.8985, longitude: -8.4705 };

async function setBug(request: APIRequestContext, bug: string) {
  const response = await request.post(`${API_URL}/test/bugs`, { data: { enable: [bug] } });
  expect(response.status(), `Enable ${bug} defect mode`).toBe(200);
}

test.describe('PLS-13 Store finder', () => {
  test('PLS-13.1 the 3 nearest stores to Galway are listed nearest first with distances in km', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(GALWAY);
    const stores = new StoresPage(page);
    await stores.goto();
    await stores.locateButton.click();

    await expect(stores.nearestNames).toHaveText(['PlayLab Galway', 'PlayLab Limerick', 'PlayLab Athlone']);
    await expect(stores.nearestDistances).toHaveCount(3);
    const labels = await stores.nearestDistances.allTextContents();
    for (const label of labels) expect(label).toMatch(/^\d+\.\d km away$/);
    const km = (await stores.nearestDistances.evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-km'))))) as number[];
    expect(km[0]).toBeLessThan(1);
    expect(km).toEqual([...km].sort((a, b) => a - b));
  });

  test('PLS-13.1 defect geolocation-ignored lists Dublin stores whatever the location', async ({ page, request, context }) => {
    await setBug(request, 'geolocation-ignored');
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(GALWAY);
    const stores = new StoresPage(page);
    await stores.goto();
    await stores.locateButton.click();

    await expect(stores.nearestNames.first()).toHaveText('PlayLab Grafton Street');
  });

  test('PLS-13.2 a denied location shows a message and the town search still works', async ({ page }) => {
    // No geolocation permission is granted, so the browser refuses straight away.
    const stores = new StoresPage(page);
    await stores.goto();
    await stores.locateButton.click();

    await expect(stores.denied).toHaveText('Location access was denied. Search by town instead.');
    await expect(stores.loading).toHaveCount(0);
    await expect(stores.locateButton).toBeEnabled();

    await stores.searchInput.fill('Cork');
    await stores.searchButton.click();
    await expect(stores.searchResults.getByTestId('store-name')).toHaveText(['PlayLab Cork']);
  });

  test('PLS-13.2 defect permission-denied-crash leaves the spinner running with no message', async ({ page, request }) => {
    await setBug(request, 'permission-denied-crash');
    const stores = new StoresPage(page);
    await stores.goto();
    await stores.locateButton.click();

    await expect(stores.loading).toBeVisible();
    await page.waitForTimeout(500);
    await expect(stores.loading).toBeVisible();
    await expect(stores.denied).toHaveCount(0);
  });

  test('PLS-13.3 selecting "Find stores near me" again after moving updates the results', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(GALWAY);
    const stores = new StoresPage(page);
    await stores.goto();
    await stores.locateButton.click();
    await expect(stores.nearestNames.first()).toHaveText('PlayLab Galway');

    await context.setGeolocation(CORK);
    await stores.locateButton.click();
    await expect(stores.nearestNames.first()).toHaveText('PlayLab Cork');
    await expect(page.getByTestId('store-finder-position')).toContainText('51.8985, -8.4705');
  });
});
