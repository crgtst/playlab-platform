import { AdminPage } from '../../pages/AdminPage';
import { cards, product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';
import { WEB_URL } from '../../support/env';
import type { APIRequestContext, Page } from '@playwright/test';
import type { TestUser } from '../../support/hooks';

const ordersUrl = `${API_URL}/api/v1/orders`;
const productsUrl = `${API_URL}/api/v1/products`;
const stockProductTemplate = product('EL-001');
const orderProduct = product('BK-008');
const shipping = {
  fullName: 'Admin Test Customer',
  line1: '1 Main Street',
  city: 'Dublin',
  postcode: 'D01 F5P2',
  country: 'IE',
};

interface Order {
  id: number;
  number: string;
  status: string;
  etag: string;
}

interface ProductResponse {
  data: { id: number; sku: string; name: string; priceCents: number; stock: number };
}

async function createOrder(request: APIRequestContext, customer: TestUser, productId: number): Promise<Order> {
  const headers = { Authorization: `Bearer ${customer.accessToken}` };
  const added = await request.post(`${API_URL}/api/v1/cart/items`, {
    headers,
    data: { productId, quantity: 1 },
  });
  expect(added.status()).toBe(201);

  const response = await request.post(ordersUrl, {
    headers,
    data: {
      shipping,
      deliveryDate: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
      payment: {
        nameOnCard: 'Casey Customer',
        cardNumber: cards.success.number.replaceAll(' ', ''),
        expiry: '12/30',
        cvc: '123',
      },
    },
  });
  expect(response.status(), 'Create order for admin-management scenario').toBe(201);
  return ((await response.json()) as { data: Order }).data;
}

async function setStatus(request: APIRequestContext, admin: TestUser, order: Order, status: string): Promise<Order> {
  const response = await request.patch(`${ordersUrl}/${order.id}/status`, {
    headers: { Authorization: `Bearer ${admin.accessToken}`, 'If-Match': order.etag },
    data: { status },
  });
  expect(response.status(), `Change ${order.number} to ${status}`).toBe(200);
  return ((await response.json()) as { data: Order }).data;
}

async function cancelOrders(request: APIRequestContext, admin: TestUser, orders: Order[]) {
  for (let order of orders) {
    const current = await request.get(`${ordersUrl}/${order.id}`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    });
    expect(current.status()).toBe(200);
    order = ((await current.json()) as { data: Order }).data;
    if (order.status === 'cancelled') continue;
    await setStatus(request, admin, order, 'cancelled');
  }
}

async function logIn(page: Page, user: TestUser) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function createStockProduct(request: APIRequestContext, admin: TestUser) {
  const sku = `PW-STOCK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const response = await request.post(productsUrl, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      sku,
      name: `Live stock ${sku}`,
      description: 'Temporary product for stock stream coverage',
      category: stockProductTemplate.category,
      priceCents: stockProductTemplate.priceCents,
      stock: 4,
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as ProductResponse).data;
}

async function deleteProduct(request: APIRequestContext, admin: TestUser, productId: number) {
  const response = await request.delete(`${productsUrl}/${productId}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect([204, 404]).toContain(response.status());
}

test.describe('PLS-8 Admin order management', () => {
  test('PLS-8.1 filtering the admin orders grid shows only orders with the selected status', async ({
    page,
    request,
    hooks,
  }) => {
    const admin = await hooks.createUser('admin');
    const customerA = await hooks.createUser('customer');
    const customerB = await hooks.createUser('customer');
    const ordersToCancel: Order[] = [];
    let paidOrder: Order | undefined;
    let processingOrder: Order | undefined;
    try {
      paidOrder = await createOrder(request, customerA, orderProduct.id);
      ordersToCancel.push(paidOrder);
      const secondOrder = await createOrder(request, customerB, orderProduct.id);
      ordersToCancel.push(secondOrder);
      processingOrder = await setStatus(request, admin, secondOrder, 'processing');
      await logIn(page, admin);
      const adminPage = new AdminPage(page);
      await adminPage.openOrders();
      await adminPage.searchOrders(customerB.email);
      await page.getByTestId('admin-status-filter').selectOption('processing');

      await expect(adminPage.orderRow(processingOrder.id)).toHaveAttribute('data-status', 'processing');
      await expect(adminPage.orderRow(paidOrder.id)).toHaveCount(0);
      await expect(page.getByTestId('admin-orders-count')).toHaveAttribute('data-count', '1');
    } finally {
      await cancelOrders(request, admin, ordersToCancel);
    }
  });

  test('PLS-8.2 inline status edits save and publish the change to the customer WebSocket', async ({
    browser,
    page,
    request,
    hooks,
    testSession,
  }) => {
    const admin = await hooks.createUser('admin');
    const customer = await hooks.createUser('customer');
    const order = await createOrder(request, customer, orderProduct.id);
    try {
      await logIn(page, customer);
      await page.goto(`/account/orders/${order.id}`);
      await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'paid');
      await expect(page.getByTestId('live-indicator')).toHaveAttribute('data-state', 'open');

      const adminContext = await browser.newContext({
        baseURL: WEB_URL,
        extraHTTPHeaders: { 'X-Test-Session': testSession },
        serviceWorkers: 'block',
      });
      try {
        const adminBrowserPage = await adminContext.newPage();
        await new AdminPage(adminBrowserPage).logIn(admin.email, admin.password);
        const adminPage = new AdminPage(adminBrowserPage);
        await adminPage.openOrders();
        await adminPage.searchOrders(customer.email);
        const row = adminPage.orderRow(order.id);
        await row.getByTestId('admin-order-edit').click();
        await row.getByTestId('admin-order-status-select').selectOption('processing');
        await row.getByTestId('admin-order-save').click();
        await expect(row).toHaveAttribute('data-status', 'processing');
        await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'processing');
      } finally {
        await adminContext.close();
      }
    } finally {
      await cancelOrders(request, admin, [order]);
    }
  });

  test('PLS-8.3 bulk status change updates all selected orders', async ({ page, request, hooks }) => {
    const admin = await hooks.createUser('admin');
    const customer = await hooks.createUser('customer');
    const orders = [await createOrder(request, customer, orderProduct.id), await createOrder(request, customer, orderProduct.id)];
    try {
      await logIn(page, admin);
      const adminPage = new AdminPage(page);
      await adminPage.openOrders();
      await adminPage.searchOrders(customer.email);
      for (const order of orders) {
        await adminPage.orderRow(order.id).getByTestId('row-select').check();
      }
      await expect(page.getByTestId('bulk-selected-count')).toHaveText('2 selected');
      await page.getByTestId('bulk-status-select').selectOption('processing');
      await page.getByTestId('bulk-apply-button').click();
      await expect(page.getByTestId('bulk-confirm-modal')).toBeVisible();
      const bulkResponse = page.waitForResponse(
        (response) => response.url().endsWith('/api/v1/orders/bulk-status') && response.request().method() === 'POST',
      );
      await page.getByTestId('bulk-confirm-button').click();
      expect((await bulkResponse).status()).toBe(200);

      for (const order of orders) {
        const response = await request.get(`${ordersUrl}/${order.id}`, {
          headers: { Authorization: `Bearer ${admin.accessToken}` },
        });
        expect(response.status()).toBe(200);
        expect(((await response.json()) as { data: Order }).data.status).toBe('processing');
      }
    } finally {
      await cancelOrders(request, admin, orders);
    }
  });

  test('PLS-8.4 admin can create, edit and delete a product reflected in the catalogue', async ({
    page,
    request,
    hooks,
  }) => {
    const admin = await hooks.createUser('admin');
    const sku = `PW-${Date.now()}`;
    const originalName = `Playwright Admin ${sku}`;
    const editedName = `${originalName} Updated`;
    let createdId: number | undefined;

    try {
      const priorTests = await request.get(`${productsUrl}?q=${encodeURIComponent('Playwright Admin PW-')}`);
      expect(priorTests.status()).toBe(200);
      const priorProducts = ((await priorTests.json()) as { data: ProductResponse['data'][] }).data;
      for (const oldProduct of priorProducts.filter((item) => item.sku.startsWith('PW-'))) {
        await deleteProduct(request, admin, oldProduct.id);
      }

      await logIn(page, admin);
      const adminPage = new AdminPage(page);
      await adminPage.openProducts();
      await page.getByTestId('new-product-button').click();
      await page.getByTestId('product-form-sku').fill(sku);
      await page.getByTestId('product-form-name').fill(originalName);
      await page.getByTestId('product-form-price').fill('12.34');
      await page.getByTestId('product-form-stock').fill('8');
      await page.getByTestId('product-form-description').fill(`${originalName} description`);
      const createResponse = page.waitForResponse(
        (response) => response.url().endsWith('/api/v1/products') && response.request().method() === 'POST',
      );
      await page.getByTestId('product-form-save').click();
      expect((await createResponse).status()).toBe(201);
      await expect(page.getByTestId('product-modal')).toBeHidden();

      const created = await request.get(`${productsUrl}?q=${encodeURIComponent(originalName)}`);
      expect(created.status()).toBe(200);
      const createdBody = (await created.json()) as { data: ProductResponse['data'][] };
      expect(createdBody.data).toHaveLength(1);
      createdId = createdBody.data[0].id;
      expect(createdBody.data[0]).toMatchObject({ sku, name: originalName, priceCents: 1234, stock: 8 });
      await page.goto(`/admin/products?q=${encodeURIComponent(originalName)}`);
      await expect(adminPage.productRow(createdId)).toBeVisible();

      await adminPage.productRow(createdId).getByTestId('admin-product-edit').click();
      await page.getByTestId('product-form-name').fill(editedName);
      await page.getByTestId('product-form-price').fill('15.50');
      await page.getByTestId('product-form-save').click();
      await expect(page.getByTestId('product-modal')).toBeHidden();
      const updated = await request.get(`${productsUrl}/${createdId}`);
      expect(updated.status()).toBe(200);
      const updatedBody = (await updated.json()) as ProductResponse;
      expect(updatedBody.data).toMatchObject({ name: editedName, priceCents: 1550, stock: 8 });
      await page.goto(`/admin/products?q=${encodeURIComponent(editedName)}`);
      await expect(adminPage.productRow(createdId)).toContainText(editedName);

      const detailPage = page.waitForResponse(
        (response) => response.url().includes(`/api/v1/products/${createdId}`) && response.request().method() === 'GET',
      );
      await page.goto(`/products/${createdId}`);
      expect((await detailPage).status()).toBe(200);
      await expect(page.getByTestId('product-title')).toHaveText(editedName);
      await expect(page.getByTestId('product-price')).toHaveAttribute('data-price-cents', '1550');

      await page.goto(`/admin/products?q=${encodeURIComponent(editedName)}`);
      page.once('dialog', (dialog) => dialog.accept());
      const row = adminPage.productRow(createdId);
      await row.getByTestId('admin-product-delete').click();
      await expect(row).toHaveCount(0);
      const deleted = await request.get(`${productsUrl}/${createdId}`);
      expect(deleted.status()).toBe(404);
      createdId = undefined;
    } finally {
      if (createdId) {
        const response = await request.delete(`${productsUrl}/${createdId}`, {
          headers: { Authorization: `Bearer ${admin.accessToken}` },
        });
        expect([204, 404]).toContain(response.status());
      }
    }
  });

  test('PLS-8.5 support users have disabled edit controls and receive 403 from the edit API', async ({
    page,
    request,
    hooks,
  }) => {
    const admin = await hooks.createUser('admin');
    const support = await hooks.createUser('support');
    const customer = await hooks.createUser('customer');
    const order = await createOrder(request, customer, orderProduct.id);
    try {
      await logIn(page, support);
      const adminPage = new AdminPage(page);
      await adminPage.openOrders();
      await adminPage.searchOrders(customer.email);
      const row = adminPage.orderRow(order.id);
      await expect(row.getByTestId('admin-order-edit')).toBeDisabled();

      const response = await request.patch(`${ordersUrl}/${order.id}/status`, {
        headers: { Authorization: `Bearer ${support.accessToken}`, 'If-Match': order.etag },
        data: { status: 'processing' },
      });
      expect(response.status()).toBe(403);
    } finally {
      await cancelOrders(request, admin, [order]);
    }
  });

  test('PLS-8.6 an open product page receives stock changes within five seconds', async ({ page, request, hooks }) => {
    const admin = await hooks.createUser('admin');
    const currentProduct = await createStockProduct(request, admin);
    const productResponse = await request.get(`${productsUrl}/${currentProduct.id}`);
    expect(productResponse.status()).toBe(200);
    const etag = productResponse.headers().etag;
    if (!etag) throw new Error('Product response is missing its ETag');
    const nextStock = currentProduct.stock + 1;

    try {
      await page.goto(`/products/${currentProduct.id}`);
      await expect(page.getByTestId('stock-live-indicator')).toHaveAttribute('data-state', 'open');
      await expect(page.getByTestId('product-stock-count')).toHaveText(`${currentProduct.stock} available`);

      const updated = await request.patch(`${productsUrl}/${currentProduct.id}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}`, 'If-Match': etag },
        data: { stock: nextStock },
      });
      expect(updated.status()).toBe(200);
      await expect(page.getByTestId('product-stock-count')).toHaveText(`${nextStock} available`, { timeout: 5_000 });
    } finally {
      await deleteProduct(request, admin, currentProduct.id);
    }
  });

  test('PLS-8.6 detects the stale-stock defect', async ({ page, request, hooks }) => {
    const admin = await hooks.createUser('admin');
    const currentProduct = await createStockProduct(request, admin);
    const productResponse = await request.get(`${productsUrl}/${currentProduct.id}`);
    expect(productResponse.status()).toBe(200);
    const etag = productResponse.headers().etag;
    if (!etag) throw new Error('Product response is missing its ETag');
    const nextStock = currentProduct.stock + 1;

    try {
      const enabled = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['stale-stock'] } });
      expect(enabled.status()).toBe(200);
      await page.goto(`/products/${currentProduct.id}`);
      await expect(page.getByTestId('stock-live-indicator')).toHaveAttribute('data-state', 'open');
      await expect(page.getByTestId('product-stock-count')).toHaveText(`${currentProduct.stock} available`);

      const updated = await request.patch(`${productsUrl}/${currentProduct.id}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}`, 'If-Match': etag },
        data: { stock: nextStock },
      });
      expect(updated.status()).toBe(200);
      await page.waitForTimeout(500);
      await expect(page.getByTestId('product-stock-count')).toHaveText(`${currentProduct.stock} available`);
    } finally {
      await deleteProduct(request, admin, currentProduct.id);
    }
  });
});
