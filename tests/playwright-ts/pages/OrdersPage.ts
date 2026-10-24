import { Locator, Page } from '@playwright/test';

export class OrdersPage {
  readonly history: Locator;
  readonly rows: Locator;

  constructor(private readonly page: Page) {
    this.history = page.getByTestId('order-history');
    this.rows = page.getByTestId('order-row');
  }

  async openHistory() {
    await this.page.goto('/account');
  }

  row(orderId: number): Locator {
    return this.page.locator(`[data-testid="order-row"][data-order-id="${orderId}"]`);
  }
}
