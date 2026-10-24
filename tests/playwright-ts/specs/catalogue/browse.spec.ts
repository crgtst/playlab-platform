import { ProductListingPage } from '../../pages/ProductListingPage';
import { categories, products } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';

test.describe('PLS-3 Product search and browse', () => {
  test('PLS-3.1 searching shows only matching products and an accurate result count', async ({ page }) => {
    const catalogue = new ProductListingPage(page);
    await catalogue.goto();
    await catalogue.searchFor('earbuds');

    const matches = products.filter((product) => `${product.name}`.toLowerCase().includes('earbuds'));
    await expect(catalogue.resultCount).toHaveAttribute('data-count', String(matches.length));
    await expect(catalogue.productCards).toHaveCount(matches.length);
    await expect(catalogue.productCards.getByTestId('product-name').first()).toHaveText(matches[0].name);
    expect(await catalogue.productIds()).toEqual(matches.map((product) => product.id));
  });

  test('PLS-3.2 a search term containing an apostrophe returns matching products', async ({ page }) => {
    const catalogue = new ProductListingPage(page);
    await catalogue.goto();
    await catalogue.searchFor("O'Neill");

    const matches = products.filter((product) => product.name.toLowerCase().includes("o'neill"));
    await expect(catalogue.error).toHaveCount(0);
    await expect(catalogue.resultCount).toHaveAttribute('data-count', String(matches.length));
    expect((await catalogue.productIds()).sort((a, b) => a - b)).toEqual(
      matches.map((product) => product.id).sort((a, b) => a - b),
    );
  });

  test('PLS-3.2 the search-apostrophe defect is detected and disabling it restores search', async ({ page, request }) => {
    const bugResponse = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['search-apostrophe'] } });
    expect(bugResponse.status()).toBe(200);

    const catalogue = new ProductListingPage(page);
    await catalogue.goto();
    await catalogue.searchFor("O'Neill");
    await expect(catalogue.error).toBeVisible();

    const disableResponse = await request.post(`${API_URL}/test/bugs`, { data: { disable: ['search-apostrophe'] } });
    expect(disableResponse.status()).toBe(200);
    await catalogue.goto();
    await catalogue.searchFor("O'Neill");
    await expect(catalogue.error).toHaveCount(0);
    await expect(catalogue.productCards).toHaveCount(2);
  });

  test('PLS-3.3 category and minimum/maximum price filters apply together', async ({ page }) => {
    const category = categories.find((item) => item.slug === 'books');
    expect(category).toBeDefined();
    const matches = products.filter(
      (product) => product.category === 'books' && product.priceCents >= 1500 && product.priceCents <= 3000,
    );

    const catalogue = new ProductListingPage(page);
    await catalogue.goto();
    await catalogue.category.selectOption(category!.slug);
    await catalogue.minPrice.fill('15');
    await catalogue.maxPrice.fill('30');
    const response = catalogue.waitForProducts({ category: category!.slug, minPrice: '15', maxPrice: '30' });
    await catalogue.applyFilters.click();
    await response;

    await expect(catalogue.resultCount).toHaveAttribute('data-count', String(matches.length));
    expect((await catalogue.productIds()).sort((a, b) => a - b)).toEqual(
      matches.map((product) => product.id).sort((a, b) => a - b),
    );
    const cards = catalogue.productCards;
    for (let i = 0; i < (await cards.count()); i++) {
      await expect(cards.nth(i).getByTestId('product-category')).toHaveText(category!.name);
      const price = Number(await cards.nth(i).getByTestId('product-price').getAttribute('data-price-cents'));
      expect(price).toBeGreaterThanOrEqual(1500);
      expect(price).toBeLessThanOrEqual(3000);
    }
  });

  test('PLS-3.4 sorting by price ascending orders every result from low to high', async ({ page }) => {
    const catalogue = new ProductListingPage(page);
    await catalogue.goto();
    const response = catalogue.waitForProducts({ sort: 'price_asc' });
    await catalogue.sort.selectOption('price_asc');
    await response;
    await expect(catalogue.resultCount).toHaveAttribute('data-count', String(products.length));

    const prices: number[] = [];
    while (true) {
      const currentPageIds = await catalogue.productIds();
      prices.push(...(await catalogue.pricesCents()));
      if (!(await catalogue.nextPage.isEnabled())) break;
      const nextPage = prices.length / 12 + 1;
      const nextResponse = catalogue.waitForProducts({ page: String(nextPage), sort: 'price_asc' });
      await catalogue.nextPage.click();
      await nextResponse;
      await expect.poll(() => catalogue.productIds()).not.toEqual(currentPageIds);
    }

    expect(prices).toHaveLength(products.length);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  test('PLS-3.5 paging through the catalogue shows every product once with no omissions', async ({ page }) => {
    const catalogue = new ProductListingPage(page);
    await catalogue.goto();

    const seen: number[] = [];
    while (true) {
      const currentPageIds = await catalogue.productIds();
      seen.push(...currentPageIds);
      if (!(await catalogue.nextPage.isEnabled())) break;
      const response = catalogue.waitForProducts({ page: String(seen.length / 12 + 1) });
      await catalogue.nextPage.click();
      await response;
      await expect(page).toHaveURL(new RegExp(`page=${seen.length / 12 + 1}`));
      await expect.poll(() => catalogue.productIds()).not.toEqual(currentPageIds);
    }

    expect(seen).toHaveLength(products.length);
    expect(new Set(seen).size).toBe(products.length);
    expect([...seen].sort((a, b) => a - b)).toEqual(products.map((product) => product.id).sort((a, b) => a - b));
  });

  test('PLS-3.5 the pagination-duplicate defect repeats a product across pages', async ({ page, request }) => {
    const bugResponse = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['pagination-duplicate'] } });
    expect(bugResponse.status()).toBe(200);

    const catalogue = new ProductListingPage(page);
    await catalogue.goto();
    const firstPage = await catalogue.productIds();
    const response = catalogue.waitForProducts({ page: '2' });
    await catalogue.nextPage.click();
    await response;
    await expect(page).toHaveURL(/page=2/);
    await expect.poll(() => catalogue.productIds()).not.toEqual(firstPage);
    const secondPage = await catalogue.productIds();

    expect(secondPage[0]).toBe(firstPage[firstPage.length - 1]);
  });

  test('PLS-3.6 no matches show an empty state and clear filters returns to the full catalogue', async ({ page }) => {
    const catalogue = new ProductListingPage(page);
    await catalogue.goto();
    await catalogue.searchFor('no-product-has-this-name');

    await expect(catalogue.resultCount).toHaveAttribute('data-count', '0');
    await expect(catalogue.emptyState).toContainText('No products match your search.');
    await catalogue.clearFilters.click();

    await expect(catalogue.resultCount).toHaveAttribute('data-count', String(products.length));
    await expect(catalogue.productCards).toHaveCount(12);
  });
});
