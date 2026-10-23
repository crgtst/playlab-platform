import { Locator, Page } from '@playwright/test';

export class CartPage {
  readonly items: Locator;
  readonly subtotal: Locator;
  readonly discountSaving: Locator;
  readonly vat: Locator;
  readonly delivery: Locator;
  readonly grandTotal: Locator;
  readonly checkout: Locator;
  readonly discountCode: Locator;
  readonly discountError: Locator;
  readonly discountAppliedCode: Locator;

  constructor(private readonly page: Page) {
    this.items = page.getByTestId('cart-item');
    this.subtotal = page.getByTestId('totals-subtotal');
    this.discountSaving = page.getByTestId('totals-discount');
    this.vat = page.getByTestId('totals-vat');
    this.delivery = page.getByTestId('totals-delivery');
    this.grandTotal = page.getByTestId('totals-total');
    this.checkout = page.getByTestId('checkout-button');
    this.discountCode = page.getByTestId('discount-code-input');
    this.discountError = page.getByTestId('discount-error');
    this.discountAppliedCode = page.getByTestId('discount-applied-code');
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

  async applyCode(code: string) {
    await this.discountCode.fill(code);
    const response = this.page.waitForResponse(
      (result) => result.url().includes('/api/v1/cart/discount') && result.request().method() === 'POST',
    );
    await this.page.getByTestId('discount-apply-button').click();
    return response;
  }
}
