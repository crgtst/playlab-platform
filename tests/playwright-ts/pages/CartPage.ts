import { Locator, Page } from '@playwright/test';

export class CartPage {
  readonly items: Locator;
  readonly subtotal: Locator;
  readonly checkout: Locator;

  constructor(private readonly page: Page) {
    this.items = page.getByTestId('cart-item');
    this.subtotal = page.getByTestId('totals-subtotal');
    this.checkout = page.getByTestId('checkout-button');
  }

  async goto() {
    await this.page.goto('/cart');
  }

  quantity(productId: number): Locator {
    return this.page.locator(`[data-testid="cart-item"][data-product-id="${productId}"]`).getByTestId('qty-input');
  }

  async addProduct(productId: number, quantity = 1) {
    await this.page.goto(`/products/${productId}`);
    await this.page.getByTestId('product-qty-input').fill(String(quantity));
    const added = this.page.waitForResponse(
      (response) => response.url().includes('/api/v1/cart/items') && response.request().method() === 'POST',
    );
    await this.page.getByTestId('add-to-cart-button').click();
    return added;
  }
}
