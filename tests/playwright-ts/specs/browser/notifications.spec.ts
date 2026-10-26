import { LoginPage } from '../../pages/LoginPage';
import { mockNotifications, notificationPermissionRequests, shownNotifications } from '../../support/browser';
import { API_URL, expect, test } from '../../support/fixtures';
import { cancelOrder, createOrder, setOrderStatus } from '../../support/orders';
import type { APIRequestContext } from '@playwright/test';

const orderProduct = 'CL-003';

async function setBug(request: APIRequestContext, bug: string) {
  const response = await request.post(`${API_URL}/test/bugs`, { data: { enable: [bug] } });
  expect(response.status(), `Enable ${bug} defect mode`).toBe(200);
}

test.describe('PLS-14 Order notifications', () => {
  test('PLS-14.1 an undecided user is offered notifications, and selecting it asks the browser for permission', async ({
    page,
    customer,
  }) => {
    await mockNotifications(page, 'default');
    await new LoginPage(page).goto();
    await new LoginPage(page).logIn(customer);
    await page.goto('/account');

    const toggle = page.getByTestId('notifications-toggle');
    await expect(toggle).toHaveText('Notify me about my orders');
    expect(await notificationPermissionRequests(page)).toBe(0);

    await toggle.click();
    await expect(page.getByTestId('notifications-status')).toHaveAttribute('data-status', 'on');
    expect(await notificationPermissionRequests(page)).toBe(1);
  });

  test('PLS-14.2 exactly one notification shows the order number and new status', async ({ page, request, hooks, customer }) => {
    await mockNotifications(page, 'granted');
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, orderProduct);
    try {
      await new LoginPage(page).goto();
      await new LoginPage(page).logIn(customer);
      await page.goto(`/account/orders/${order.id}`);
      await page.getByTestId('notifications-toggle').click();
      await expect(page.getByTestId('notifications-status')).toHaveAttribute('data-status', 'on');
      await expect(page.getByTestId('live-indicator')).toHaveAttribute('data-state', 'open');

      await setOrderStatus(request, admin, order, 'processing');
      await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'processing');
      await expect.poll(() => shownNotifications(page)).toHaveLength(1);
      // Give a duplicate time to appear before settling on "exactly one".
      await page.waitForTimeout(500);
      const shown = await shownNotifications(page);
      expect(shown).toHaveLength(1);
      expect(shown[0].title).toBe(`Order ${order.number} is now processing`);
    } finally {
      await cancelOrder(request, admin, order);
    }
  });

  test('PLS-14.2 defect notification-spam fires two notifications for one status change', async ({ page, request, hooks, customer }) => {
    await setBug(request, 'notification-spam');
    await mockNotifications(page, 'granted');
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, orderProduct);
    try {
      await new LoginPage(page).goto();
      await new LoginPage(page).logIn(customer);
      await page.goto(`/account/orders/${order.id}`);
      await page.getByTestId('notifications-toggle').click();
      await expect(page.getByTestId('live-indicator')).toHaveAttribute('data-state', 'open');

      await setOrderStatus(request, admin, order, 'processing');
      await expect.poll(() => shownNotifications(page)).toHaveLength(2);
    } finally {
      await cancelOrder(request, admin, order);
    }
  });

  test('PLS-14.3 with notifications blocked the in-page status still updates and no error is shown', async ({
    page,
    request,
    hooks,
    customer,
  }) => {
    await mockNotifications(page, 'denied');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, orderProduct);
    try {
      await new LoginPage(page).goto();
      await new LoginPage(page).logIn(customer);
      await page.goto(`/account/orders/${order.id}`);
      await expect(page.getByTestId('notifications-status')).toHaveAttribute('data-status', 'blocked');
      await expect(page.getByTestId('live-indicator')).toHaveAttribute('data-state', 'open');

      await setOrderStatus(request, admin, order, 'processing');
      await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'processing');
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect(await shownNotifications(page)).toHaveLength(0);
      expect(errors).toEqual([]);
    } finally {
      await cancelOrder(request, admin, order);
    }
  });
});
