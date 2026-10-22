import { Browser, Page } from '@playwright/test';
import { API_URL } from '../env';
import { expect, logIn, test } from './fixtures';

const ADMIN = { email: 'admin@playlab.test', password: 'Password123!' };

/** A second admin in their own browser context, as if on another computer. */
async function secondAdmin(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await logIn(page, ADMIN);
  return page;
}

function productRow(page: Page, name: string) {
  return page.getByTestId('admin-product-row').filter({ hasText: name });
}

test('PLS-8.4 an edit made after someone else changed the product is refused with a message', async ({ page, browser }) => {
  await logIn(page, ADMIN);
  const other = await secondAdmin(browser);
  for (const p of [page, other]) {
    await p.goto('/admin/products?q=Turntable');
    await productRow(p, 'Retro Vinyl Turntable').getByTestId('admin-product-edit').click();
    await expect(p.getByTestId('product-form-name')).toHaveValue('Retro Vinyl Turntable');
  }

  // The other admin saves first.
  await other.getByTestId('product-form-name').fill('Turntable (edited elsewhere)');
  await other.getByTestId('product-form-save').click();
  await expect(other.getByTestId('product-modal')).toBeHidden();

  // This admin's form is now stale.
  await page.getByTestId('product-form-price').fill('99.00');
  await page.getByTestId('product-form-save').click();
  await expect(page.getByTestId('product-form-error')).toContainText('This product was changed by someone else');

  // Opening the form again loads the other admin's change, and saving then works.
  await page.getByTestId('product-form-cancel').click();
  await page.reload();
  await productRow(page, 'Turntable (edited elsewhere)').getByTestId('admin-product-edit').click();
  await expect(page.getByTestId('product-form-name')).toHaveValue('Turntable (edited elsewhere)');
  await page.getByTestId('product-form-price').fill('99.00');
  await page.getByTestId('product-form-save').click();
  await expect(page.getByTestId('product-modal')).toBeHidden();
  await other.context().close();
});

test("PLS-21.7 the orders grid refuses to overwrite another admin's status change", async ({ page, browser, request }) => {
  await request.post(`${API_URL}/test/seed`, { data: { fixtures: ['orders-for-admin'] } });
  await logIn(page, ADMIN);
  await page.goto('/admin/orders?status=paid');
  const row = page.getByTestId('admin-order-row').first();
  const number = await row.getByTestId('admin-order-link').innerText();

  // Another admin moves the same order on while this grid is open.
  const other = await secondAdmin(browser);
  await other.goto('/admin/orders?status=paid');
  const otherRow = other.getByTestId('admin-order-row').filter({ hasText: number });
  await otherRow.getByTestId('admin-order-edit').click();
  await otherRow.getByTestId('admin-order-status-select').selectOption('processing');
  await otherRow.getByTestId('admin-order-save').click();
  await expect(other.getByTestId('toast-message').last()).toHaveText(`Order ${number} is now processing`);

  await row.getByTestId('admin-order-edit').click();
  await row.getByTestId('admin-order-status-select').selectOption('cancelled');
  await row.getByTestId('admin-order-save').click();
  await expect(page.getByTestId('toast-message').last()).toHaveText(
    `Order ${number} was changed by someone else. It now shows its current status.`,
  );
  await expect(row.getByTestId('admin-order-status')).toHaveText('processing');
  await other.context().close();
});
