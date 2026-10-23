import { FrameLocator, Locator, Page } from '@playwright/test';

export class CheckoutPage {
  readonly shippingContinue: Locator;
  readonly reviewContinue: Locator;
  readonly paymentFrame: FrameLocator;

  constructor(private readonly page: Page) {
    this.shippingContinue = page.getByTestId('shipping-continue-button');
    this.reviewContinue = page.getByTestId('review-continue-button');
    this.paymentFrame = page.frameLocator('[data-testid="payment-frame"]');
  }

  async fillShipping(name = 'Checkout Test Customer') {
    await this.page.getByTestId('shipping-full-name').fill(name);
    await this.page.getByTestId('shipping-line1').fill('1 Main Street');
    await this.page.getByTestId('shipping-city').fill('Dublin');
    await this.page.getByTestId('shipping-postcode').fill('D01 F5P2');
    const deliveryDate = new Date((await this.page.evaluate(() => Date.now())) + 5 * 86_400_000);
    const localDate = new Date(deliveryDate.getTime() - deliveryDate.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    await this.page.getByTestId('shipping-delivery-date').fill(localDate);
  }

  async fillCard(cardNumber: string) {
    await this.paymentFrame.getByTestId('frame-card-name').fill('Casey Customer');
    await this.paymentFrame.getByTestId('frame-card-number').fill(cardNumber);
    await this.paymentFrame.getByTestId('frame-card-expiry').fill('12/30');
    await this.paymentFrame.getByTestId('frame-card-cvc').fill('123');
  }

  async pay(cardNumber: string) {
    await this.fillCard(cardNumber);
    const response = this.page.waitForResponse(
      (result) => /\/pay\/intents\/[^/]+\/confirm(?:\?|$)/.test(result.url()) && result.request().method() === 'POST',
    );
    await this.paymentFrame.getByTestId('frame-pay-button').click();
    return response;
  }
}
