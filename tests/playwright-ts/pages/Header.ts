import { Locator, Page } from '@playwright/test';

/** The site header, on every page. */
export class Header {
  readonly userName: Locator;
  readonly loginLink: Locator;
  readonly cartCount: Locator;
  readonly accountMenuButton: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.userName = page.getByTestId('header-user-name');
    this.loginLink = page.getByTestId('nav-login');
    this.cartCount = page.getByTestId('cart-count');
    this.accountMenuButton = page.getByTestId('account-menu-button');
    this.logoutButton = page.getByTestId('logout-button');
  }
}
