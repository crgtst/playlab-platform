import { Header } from '../../pages/Header';
import { LoginPage } from '../../pages/LoginPage';
import { ProductPage } from '../../pages/ProductPage';
import { product } from '../../support/data';
import { expect, test } from '../../support/fixtures';

const EIGHT_DAYS = 8 * 24 * 60 * 60 * 1000;

test('PLS-1.7 an expired session returns to the same checkout step with its cart intact after login', async ({
  page,
  customer,
  hooks,
}) => {
  const login = new LoginPage(page);
  const header = new Header(page);
  const productPage = new ProductPage(page);
  const earbuds = product('EL-001');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const deliveryDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(
    tomorrow.getDate(),
  ).padStart(2, '0')}`;

  await login.goto();
  await login.logIn(customer);
  await productPage.goto(earbuds.id);
  await productPage.addToCart();
  await expect(header.cartCount).toHaveText('1');

  await page.goto('/checkout/shipping');
  await page.getByTestId('shipping-full-name').fill(customer.name);
  await page.getByTestId('shipping-line1').fill('1 High Street');
  await page.getByTestId('shipping-city').fill('Dublin');
  await page.getByTestId('shipping-postcode').fill('D01 AB12');
  await page.getByTestId('shipping-delivery-date').fill(deliveryDate);
  await page.getByTestId('shipping-continue-button').click();
  await expect(page).toHaveURL(/\/checkout\/review$/);
  await expect(page.getByTestId('review-item')).toContainText(earbuds.name);
  await page.getByTestId('review-continue-button').click();
  await expect(page).toHaveURL(/\/checkout\/payment$/);
  await expect(page.getByTestId('payment-section')).toBeVisible();

  await hooks.advanceClock(EIGHT_DAYS);
  await page.reload();

  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcheckout%2Fpayment$/);
  await login.logIn(customer);

  await expect(page).toHaveURL(/\/checkout\/payment$/);
  await expect(page.getByTestId('payment-section')).toBeVisible();
  await expect(header.cartCount).toHaveText('1');
  await expect(page.getByTestId('payment-frame')).toBeVisible();
});

test.describe('PLS-1 Login and session', () => {
  test('PLS-1.8 an expired session falls back to a guest cart when adding an item', async ({ page, context, customer, hooks }) => {
    const header = new Header(page);
    const login = new LoginPage(page);
    const productPage = new ProductPage(page);
    const earbuds = product('EL-001');

    await test.step('log in', async () => {
      await login.goto();
      await login.logIn(customer);
      await expect(header.userName).toHaveText(customer.name);
    });

    await test.step('come back after the session has ended', async () => {
      // Access tokens last 15 minutes and refresh tokens 7 days, so 8 days later neither works.
      // The clock belongs to this test's session, so other tests running in parallel don't move.
      await hooks.advanceClock(EIGHT_DAYS);
    });

    await test.step('add an item to the cart', async () => {
      await productPage.goto(earbuds.id);
      await productPage.addToCart();
    });

    await test.step('the item is in a guest cart, with no error', async () => {
      await expect(productPage.toast).toHaveText(`${earbuds.name} added to your cart`);
      await expect(productPage.addToCartError).toBeHidden();
      await expect(header.cartCount).toHaveText('1');
      await expect(header.loginLink).toBeVisible();
    });

    await test.step('the expired session cookies are cleared', async () => {
      const cookies = (await context.cookies()).map((c) => c.name);
      expect(cookies).not.toContain('session');
      expect(cookies).not.toContain('refresh_token');
    });
  });
});
