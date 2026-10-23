import { Locator, Page } from '@playwright/test';

export class ForgotPasswordPage {
  readonly email: Locator;
  readonly submit: Locator;
  readonly sent: Locator;

  constructor(private readonly page: Page) {
    this.email = page.getByTestId('forgot-password-email');
    this.submit = page.getByTestId('forgot-password-submit');
    this.sent = page.getByTestId('forgot-password-sent');
  }

  async goto() {
    await this.page.goto('/forgot-password');
  }

  async requestReset(email: string) {
    await this.email.fill(email);
    await this.submit.click();
  }
}
