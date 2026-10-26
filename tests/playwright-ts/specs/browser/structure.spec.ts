import { LoginPage } from '../../pages/LoginPage';
import { product } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';
import { cancelOrder, createOrder } from '../../support/orders';

const cardProduct = product('EL-008');

test.describe('PLS-19 Accessible structure', () => {
  test('PLS-19.1 the product card matches the approved aria snapshot', async ({ page }) => {
    await page.goto(`/products?q=${encodeURIComponent(cardProduct.name)}`);
    const card = page.getByTestId('product-card').filter({ hasText: cardProduct.name });

    await expect(card).toMatchAriaSnapshot(`
      - article "${cardProduct.name}":
        - heading "${cardProduct.name}" [level=3]:
          - link "${cardProduct.name}":
            - /url: /products/${cardProduct.id}
        - paragraph: Electronics
        - paragraph: /€\\d+\\.\\d{2}/
        - paragraph: In stock
        - 'button "Add to cart: ${cardProduct.name}"': Add to cart
        - 'button "Save: add ${cardProduct.name} to wishlist"': Save
    `);
  });

  test('PLS-19.2 the order summary headings do not skip a level', async ({ page, request, hooks, customer }) => {
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, 'CL-003');
    try {
      await new LoginPage(page).goto();
      await new LoginPage(page).logIn(customer);
      await page.goto(`/account/orders/${order.id}`);
      const headings = page.getByTestId('order-summary').getByRole('heading');

      await expect(headings.first()).toHaveText('Order summary');
      const levels = (await headings.evaluateAll((els) => els.map((el) => Number(el.tagName.slice(1))))) as number[];
      expect(levels, 'Sub-headings are one level below "Order summary"').toEqual([2, 3, 3, 3]);
      levels.slice(1).forEach((level, i) => expect(level - levels[i], `heading ${i + 2} must not skip a level`).toBeLessThanOrEqual(1));
    } finally {
      await cancelOrder(request, admin, order);
    }
  });

  test('PLS-19.2 defect aria-heading-skip jumps from h2 to h4', async ({ page, request, hooks, customer }) => {
    const bug = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['aria-heading-skip'] } });
    expect(bug.status()).toBe(200);
    const admin = await hooks.createUser('admin');
    const order = await createOrder(request, customer, 'CL-003');
    try {
      await new LoginPage(page).goto();
      await new LoginPage(page).logIn(customer);
      await page.goto(`/account/orders/${order.id}`);
      const headings = page.getByTestId('order-summary').getByRole('heading');

      await expect(headings.first()).toHaveText('Order summary');
      const levels = (await headings.evaluateAll((els) => els.map((el) => Number(el.tagName.slice(1))))) as number[];
      expect(levels.slice(1).some((level, i) => level - levels[i] > 1)).toBe(true);
    } finally {
      await cancelOrder(request, admin, order);
    }
  });

  test.describe('PLS-19.3 the site header matches the approved aria snapshot', () => {
    test('on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/products');
      await expect(page.getByTestId('site-header')).toMatchAriaSnapshot(`
        - banner:
          - link "PlayLab Shop":
            - /url: /
          - navigation "Main":
            - link "Shop":
              - /url: /products
            - link "New arrivals":
              - /url: /new-arrivals
            - link "Stores":
              - /url: /stores
          - search:
            - text: Search products
            - searchbox "Search products"
            - button "Search"
          - text: Language
          - combobox "Language":
            - option "English" [selected]
            - option "Gaeilge"
          - text: Currency
          - combobox "Currency":
            - option "€ EUR" [selected]
            - option "£ GBP"
          - button "Dark mode"
          - link "Cart, 0":
            - /url: /cart
            - text: Cart 0
          - link "Log in":
            - /url: /login
          - link "Register":
            - /url: /register
      `);
    });

    test('on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/products');
      await expect(page.getByTestId('site-header')).toMatchAriaSnapshot(`
        - banner:
          - link "PlayLab Shop":
            - /url: /
          - link "Cart, 0":
            - /url: /cart
            - text: 🛒 0
          - button "Menu"
      `);
    });
  });
});
