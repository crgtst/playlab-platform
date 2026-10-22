import { Page } from '@playwright/test';
import { API_URL } from '../env';
import { expect, logIn, test } from './fixtures';

const ADMIN = { email: 'admin@playlab.test', password: 'Password123!' };

test.beforeEach(async ({ page, request }) => {
  await request.post(`${API_URL}/test/seed`, { data: { fixtures: ['orders-for-admin'] } });
  await logIn(page, ADMIN);
  await page.goto('/admin/orders');
});

/**
 * The order number of the first row on the page with this status, and that row found by its number:
 * editing replaces the status text with a select, so the row can't be found by its status while it's open.
 */
async function rowWithStatus(page: Page, status: string) {
  const first = page
    .getByTestId('admin-order-row')
    .filter({ has: page.getByTestId('admin-order-status').getByText(status, { exact: true }) })
    .first();
  const number = await first.getByTestId('admin-order-link').innerText();
  const row = page.getByTestId('admin-order-row').filter({ has: page.getByTestId('admin-order-link').getByText(number, { exact: true }) });
  return { number, row };
}

async function changeStatus(row: ReturnType<Page['getByTestId']>, status: string) {
  await row.getByTestId('admin-order-edit').click();
  await row.getByTestId('admin-order-status-select').selectOption(status);
  await row.getByTestId('admin-order-save').click();
}

test('PLS-8.2 an allowed status change saves; a refused one shows the reason', async ({ page }) => {
  const paid = await rowWithStatus(page, 'paid');
  await changeStatus(paid.row, 'processing');
  await expect(page.getByTestId('toast-message').last()).toHaveText(`Order ${paid.number} is now processing`);
  await expect(paid.row.getByTestId('admin-order-status')).toHaveText('processing');

  // A shipped order can only be delivered.
  const shipped = await rowWithStatus(page, 'shipped');
  await changeStatus(shipped.row, 'cancelled');
  await expect(page.getByTestId('toast-message').last()).toHaveText(
    `Order ${shipped.number} is shipped, so it can't be changed to cancelled`,
  );
  await page.reload();
  await expect(shipped.row.getByTestId('admin-order-status')).toHaveText('shipped');
});

test('PLS-8.3 a bulk change with an order that cannot move changes nothing and says why', async ({ page }) => {
  const paid = await rowWithStatus(page, 'paid');
  const shipped = await rowWithStatus(page, 'shipped');
  await paid.row.getByTestId('row-select').check();
  await shipped.row.getByTestId('row-select').check();
  await page.getByTestId('bulk-status-select').selectOption('processing');
  await page.getByTestId('bulk-apply-button').click();
  await page.getByTestId('bulk-confirm-button').click();

  await expect(page.getByTestId('toast-message').last()).toHaveText(
    "1 of the selected orders can't be changed to processing; none were changed",
  );
  await page.reload();
  await expect(paid.row.getByTestId('admin-order-status')).toHaveText('paid');
  await expect(shipped.row.getByTestId('admin-order-status')).toHaveText('shipped');
});
