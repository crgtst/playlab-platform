import { AccountPage } from '../../pages/AccountPage';
import { AdminPage } from '../../pages/AdminPage';
import { cards, product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import type { TestUser } from '../../support/hooks';

const ordersUrl = `${API_URL}/api/v1/orders`;
const exportProduct = product('CL-005');
const MAX_BYTES = 2 * 1024 * 1024;
const shipping = {
  fullName: 'Files Test Customer',
  line1: '1 Main Street',
  city: 'Dublin',
  postcode: 'D01 F5P2',
  country: 'IE',
};

/** Smallest valid images: a 1x1 PNG and a 1x1 JPEG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

async function logIn(page: Page, user: TestUser) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function setBug(request: APIRequestContext, bug: string) {
  const response = await request.post(`${API_URL}/test/bugs`, { data: { enable: [bug] } });
  expect(response.status(), `Enable ${bug} defect mode`).toBe(200);
}

async function createOrder(request: APIRequestContext, user: TestUser): Promise<{ id: number; number: string }> {
  const headers = { Authorization: `Bearer ${user.accessToken}` };
  const added = await request.post(`${API_URL}/api/v1/cart/items`, { headers, data: { productId: exportProduct.id, quantity: 1 } });
  expect(added.status(), 'Add product to the isolated customer cart').toBe(201);
  const placed = await request.post(ordersUrl, {
    headers,
    data: {
      shipping,
      deliveryDate: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
      payment: { nameOnCard: 'Casey Customer', cardNumber: cards.success.number.replaceAll(' ', ''), expiry: '12/30', cvc: '123' },
    },
  });
  expect(placed.status(), 'Place isolated test order').toBe(201);
  return ((await placed.json()) as { data: { id: number; number: string } }).data;
}

test.describe('PLS-9 Files', () => {
  test('PLS-9.1 a PNG or JPG under 2 MB becomes the avatar', async ({ page, request, customer }) => {
    await logIn(page, customer);
    const account = new AccountPage(page);
    await account.goto();
    await expect(account.avatarPlaceholder).toBeVisible();

    for (const file of [
      { name: 'avatar.png', mimeType: 'image/png', buffer: PNG },
      { name: 'avatar.jpg', mimeType: 'image/jpeg', buffer: JPG },
    ]) {
      const response = await account.upload(file);
      expect(response.status(), `Upload ${file.name}`).toBe(201);
      await expect(account.avatarImage).toBeVisible();
      await expect(account.avatarImage).toHaveAttribute('src', new RegExp(`/users/${customer.id}/avatar`));

      // The avatar is served back as the image that was uploaded.
      const src = (await account.avatarImage.getAttribute('src'))!;
      const served = await request.get(`${API_URL}${src}`);
      expect(served.status()).toBe(200);
      expect(served.headers()['content-type']).toBe(file.mimeType);
      expect((await served.body()).equals(file.buffer)).toBe(true);
    }

    // It is still the avatar after a reload.
    await page.reload();
    await expect(account.avatarImage).toBeVisible();
  });

  test('PLS-9.2 a file over 2 MB shows "File too large" and the API returns 413', async ({ page, customer }) => {
    await logIn(page, customer);
    const account = new AccountPage(page);
    await account.goto();

    // A valid PNG header, padded one byte over the limit.
    const buffer = Buffer.concat([PNG, Buffer.alloc(MAX_BYTES + 1 - PNG.length)]);
    const response = await account.upload({ name: 'huge.png', mimeType: 'image/png', buffer });
    expect(response.status()).toBe(413);
    await expect(account.error).toHaveText('File too large');
    await expect(account.avatarPlaceholder).toBeVisible();
  });

  test('PLS-9.3 a non-image file renamed to .png is rejected and the API returns 415', async ({ page, customer }) => {
    await logIn(page, customer);
    const account = new AccountPage(page);
    await account.goto();

    const response = await account.upload({
      name: 'not-really.png',
      mimeType: 'image/png',
      buffer: Buffer.from('MZ this is not an image'),
    });
    expect(response.status()).toBe(415);
    await expect(account.error).toHaveText('Only PNG or JPG images are allowed');
    await expect(account.avatarPlaceholder).toBeVisible();
  });

  test('PLS-9.3 defect upload-extension-only accepts a renamed non-image', async ({ page, request, customer }) => {
    await setBug(request, 'upload-extension-only');
    await logIn(page, customer);
    const account = new AccountPage(page);
    await account.goto();

    const response = await account.upload({
      name: 'not-really.png',
      mimeType: 'image/png',
      buffer: Buffer.from('MZ this is not an image'),
    });
    expect(response.status(), 'With the defect on, only the extension is checked').toBe(201);
  });

  test('PLS-9.4 an admin exports orders to a CSV with a header row and one row per order', async ({ page, request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const orders = [await createOrder(request, customer), await createOrder(request, customer)];
    try {
      const adminPage = new AdminPage(page);
      await adminPage.logIn(admin.email, admin.password);
      await adminPage.openOrders();
      // Narrow the list to this test's customer; the export follows the filter.
      await adminPage.searchOrders(customer.email);
      await expect(page.getByTestId('admin-order-row')).toHaveCount(orders.length);

      const downloadStarted = page.waitForEvent('download');
      await page.getByTestId('export-csv-link').click();
      const download = await downloadStarted;
      expect(download.suggestedFilename()).toMatch(/\.csv$/);

      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const lines = Buffer.concat(chunks).toString('utf8').trim().split(/\r?\n/);

      expect(lines[0].split(',').slice(0, 5)).toEqual(['number', 'created_at', 'customer_email', 'status', 'items']);
      const rows = lines.slice(1);
      expect(rows).toHaveLength(orders.length);
      for (const order of orders) {
        expect(rows.filter((row) => row.startsWith(`${order.number},`))).toHaveLength(1);
      }
      for (const row of rows) expect(row).toContain(customer.email);
    } finally {
      for (const order of orders) {
        const cancelled = await request.post(`${ordersUrl}/${order.id}/cancel`, {
          headers: { Authorization: `Bearer ${customer.accessToken}` },
        });
        expect(cancelled.status(), `Cancel ${order.number} and restore product stock`).toBe(200);
      }
    }
  });
});
