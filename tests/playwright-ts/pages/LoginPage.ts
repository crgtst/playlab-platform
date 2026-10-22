import { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;

  constructor(private readonly page: Page) {
    this.email = page.getByTestId('login-email');
    this.password = page.getByTestId('login-password');
    this.submit = page.getByTestId('login-submit');
  }

  async goto() {
    await this.page.goto('/login');
  }

  /** Logs in and waits to leave the login page. */
  async logIn(user: { email: string; password: string }) {
    await this.email.fill(user.email);
    await this.password.fill(user.password);
    await this.submit.click();
    await this.page.waitForURL((url) => !url.pathname.startsWith('/login'));
  }
}
