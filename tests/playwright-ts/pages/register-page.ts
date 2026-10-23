import { Locator, Page } from '@playwright/test';

export class RegisterPage {
  readonly name: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly nameError: Locator;
  readonly emailError: Locator;
  readonly passwordError: Locator;
  readonly error: Locator;
  readonly success: Locator;
  readonly loginLink: Locator;

  constructor(private readonly page: Page) {
    this.name = page.getByTestId('register-name');
    this.email = page.getByTestId('register-email');
    this.password = page.getByTestId('register-password');
    this.submit = page.getByTestId('register-submit');
    this.nameError = page.getByTestId('register-name-error');
    this.emailError = page.getByTestId('register-email-error');
    this.passwordError = page.getByTestId('register-password-error');
    this.error = page.getByTestId('register-error');
    this.success = page.getByTestId('register-success');
    this.loginLink = page.getByTestId('register-login-link');
  }

  async goto() {
    await this.page.goto('/register');
  }

  async register(input: { name: string; email: string; password: string }) {
    await this.name.fill(input.name);
    await this.email.fill(input.email);
    await this.password.fill(input.password);
    await this.submit.click();
  }
}
