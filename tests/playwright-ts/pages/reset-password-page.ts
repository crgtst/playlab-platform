import { Locator, Page } from '@playwright/test';

export class ResetPasswordPage {
  readonly password: Locator;
  readonly confirm: Locator;
  readonly submit: Locator;
  readonly error: Locator;
  readonly success: Locator;

  constructor(private readonly page: Page) {
    this.password = page.getByTestId('reset-password-input');
    this.confirm = page.getByTestId('reset-password-confirm');
    this.submit = page.getByTestId('reset-password-submit');
    this.error = page.getByTestId('reset-password-error');
    this.success = page.getByTestId('reset-password-success');
  }

  async goto(link: string) {
    const url = new URL(link);
    await this.page.goto(`${url.pathname}${url.search}`);
  }

  async submitNewPassword(password: string) {
    await this.password.fill(password);
    await this.confirm.fill(password);
    await this.submit.click();
  }
}
