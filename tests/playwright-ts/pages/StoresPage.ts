import { Locator, Page } from '@playwright/test';

export class StoresPage {
  readonly locateButton: Locator;
  readonly loading: Locator;
  readonly denied: Locator;
  readonly nearest: Locator;
  readonly nearestNames: Locator;
  readonly nearestDistances: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly searchResults: Locator;

  constructor(private readonly page: Page) {
    this.locateButton = page.getByTestId('store-locate-button');
    this.loading = page.getByTestId('store-finder-loading');
    this.denied = page.getByTestId('store-finder-denied');
    this.nearest = page.getByTestId('nearest-stores');
    this.nearestNames = this.nearest.getByTestId('store-name');
    this.nearestDistances = this.nearest.getByTestId('store-distance');
    this.searchInput = page.getByTestId('store-search-input');
    this.searchButton = page.getByTestId('store-search-button');
    this.searchResults = page.getByTestId('store-search-results');
  }

  async goto() {
    await this.page.goto('/stores');
  }
}
