import { Locator, Page } from '@playwright/test';

export class ProductListingPage {
  readonly search: Locator;
  readonly category: Locator;
  readonly minPrice: Locator;
  readonly maxPrice: Locator;
  readonly applyFilters: Locator;
  readonly sort: Locator;
  readonly resultCount: Locator;
  readonly productCards: Locator;
  readonly emptyState: Locator;
  readonly clearFilters: Locator;
  readonly error: Locator;
  readonly nextPage: Locator;
  readonly previousPage: Locator;

  constructor(private readonly page: Page) {
    this.search = page.getByTestId('filter-search-input');
    this.category = page.getByTestId('filter-category-select');
    this.minPrice = page.getByTestId('filter-min-price-input');
    this.maxPrice = page.getByTestId('filter-max-price-input');
    this.applyFilters = page.getByTestId('filter-apply-button');
    this.sort = page.getByTestId('sort-select');
    this.resultCount = page.getByTestId('result-count');
    this.productCards = page.getByTestId('product-card');
    this.emptyState = page.getByTestId('empty-state');
    this.clearFilters = page.getByTestId('clear-filters-link');
    this.error = page.getByTestId('products-error');
    this.nextPage = page.getByTestId('pagination-next');
    this.previousPage = page.getByTestId('pagination-prev');
  }

  async goto() {
    await this.page.goto('/products');
    await this.resultCount.waitFor();
  }

  async searchFor(term: string) {
    await this.search.fill(term);
    const response = this.waitForProducts({ q: term });
    await this.applyFilters.click();
    await response;
  }

  waitForProducts(params: Record<string, string>) {
    return this.page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith('/api/v1/products') &&
        Object.entries(params).every(([key, value]) => url.searchParams.get(key) === value)
      );
    });
  }

  async productIds(): Promise<number[]> {
    return this.productCards.evaluateAll((cards) => cards.map((card) => Number(card.getAttribute('data-product-id'))));
  }

  async pricesCents(): Promise<number[]> {
    return this.productCards.getByTestId('product-price').evaluateAll((prices) => prices.map((price) => Number(price.getAttribute('data-price-cents'))));
  }
}
