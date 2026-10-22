import { Locator, Page } from '@playwright/test';

/** A product's detail page, /products/{id}. */
export class ProductPage {
  readonly addToCartButton: Locator;
  readonly addToCartError: Locator;
  /** The newest toast, e.g. "Wireless Earbuds added to your cart". */
  readonly toast: Locator;

  constructor(private readonly page: Page) {
    this.addToCartButton = page.getByTestId('add-to-cart-button');
    this.addToCartError = page.getByTestId('add-to-cart-error');
    this.toast = page.getByTestId('toast-message').last();
  }

  async goto(productId: number) {
    await this.page.goto(`/products/${productId}`);
  }

  async addToCart() {
    await this.addToCartButton.click();
  }
}
