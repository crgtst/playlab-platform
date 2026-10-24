import { Locator, Page } from '@playwright/test';

export class AdminPage {
  readonly ordersTable: Locator;
  readonly productsTable: Locator;

  constructor(private readonly page: Page) {
    this.ordersTable = page.getByTestId('admin-orders-table');
    this.productsTable = page.getByTestId('admin-products-table');
  }

  async logIn(email: string, password: string) {
    await this.page.goto('/login');
    await this.page.getByTestId('login-email').fill(email);
    await this.page.getByTestId('login-password').fill(password);
    await this.page.getByTestId('login-submit').click();
    await this.page.waitForURL((url) => !url.pathname.startsWith('/login'));
  }

  async openOrders() {
    await this.page.goto('/admin/orders');
    await this.ordersTable.waitFor();
  }

  async searchOrders(query: string) {
    await this.page.getByTestId('admin-search-input').fill(query);
    await this.page.getByTestId('admin-search-button').click();
  }

  async openProducts() {
    await this.page.goto('/admin/products');
    await this.productsTable.waitFor();
  }

  orderRow(orderId: number): Locator {
    return this.page.locator(`[data-testid="admin-order-row"][data-order-id="${orderId}"]`);
  }

  productRow(productId: number): Locator {
    return this.page.locator(`[data-testid="admin-product-row"][data-product-id="${productId}"]`);
  }
}
