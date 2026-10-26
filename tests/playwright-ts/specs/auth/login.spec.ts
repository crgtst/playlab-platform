import { Header } from '../../pages/Header';
import { LoginPage } from '../../pages/LoginPage';
import { API_URL, expect, test } from '../../support/fixtures';

const AUTH_URL = `${API_URL}/api/v1/auth`;

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

test.describe('PLS-1 Login and session', () => {
  test('PLS-1.1 a customer logs in and lands on the home page', async ({ page, customer }) => {
    const login = new LoginPage(page);
    const header = new Header(page);

    await login.goto();
    await login.logIn(customer);

    await expect(page).toHaveURL(/\/$/);
    await expect(header.userName).toHaveText(customer.name);
  });

  test('PLS-1.2 an incorrect password shows an error without setting session cookies', async ({
    page,
    context,
    customer,
  }) => {
    const login = new LoginPage(page);

    await login.goto();
    await login.email.fill(customer.email);
    await login.password.fill('incorrect-password');
    await login.submit.click();

    await expect(login.error).toHaveText('Email or password is incorrect');
    const cookieNames = (await context.cookies()).map((cookie) => cookie.name);
    expect(cookieNames).not.toContain('session');
    expect(cookieNames).not.toContain('refresh_token');
  });

  test('PLS-1.3 the sixth failed login attempt is refused with 423', async ({ request, customer, hooks }) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await request.post(`${AUTH_URL}/login`, {
        data: { email: customer.email, password: 'incorrect-password' },
      });
      expect(response.status(), `failed login attempt ${attempt + 1}`).toBe(401);
    }

    const response = await request.post(`${AUTH_URL}/login`, {
      data: { email: customer.email, password: 'incorrect-password' },
    });
    expect(response.status()).toBe(423);
    expect((await response.json()).error.code).toBe('ACCOUNT_LOCKED');

    await hooks.advanceClock(15 * 60 * 1000);
    const unlockedResponse = await request.post(`${AUTH_URL}/login`, {
      data: { email: customer.email, password: customer.password },
    });
    expect(unlockedResponse.status()).toBe(200);
  });

  test('PLS-1.4 logging out clears the session and prevents the account page appearing on back navigation', async ({
    page,
    context,
    customer,
  }) => {
    const login = new LoginPage(page);
    const header = new Header(page);

    await login.goto();
    await login.logIn(customer);
    await page.goto('/account');
    await expect(page).toHaveURL(/\/account(?:\/|$)/);

    await header.accountMenuButton.press('ArrowDown');
    await header.logoutButton.click();

    await expect(header.loginLink).toBeVisible();
    const cookieNames = (await context.cookies()).map((cookie) => cookie.name);
    expect(cookieNames).not.toContain('session');
    expect(cookieNames).not.toContain('refresh_token');

    await page.goBack();
    await expect(page).not.toHaveURL(/\/account(?:\/|$)/);
  });

  test('PLS-1.4 detects the logout-incomplete defect', async ({ page, context, request, customer }) => {
    const bug = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['logout-incomplete'] } });
    expect(bug.status()).toBe(200);
    const login = new LoginPage(page);
    const header = new Header(page);

    await login.goto();
    await login.logIn(customer);
    await page.goto('/account');
    await header.accountMenuButton.press('ArrowDown');
    await header.logoutButton.click();

    // Logout reports success but the session cookies are still there, so the account page is still reachable.
    const cookieNames = (await context.cookies()).map((cookie) => cookie.name);
    expect(cookieNames).toContain('session');
    expect(cookieNames).toContain('refresh_token');
    await page.goto('/account');
    await expect(page).toHaveURL(/\/account(?:\/|$)/);
  });

  test('PLS-1.5 an access token older than 15 minutes is refused', async ({ request, customer, hooks }) => {
    const loginResponse = await request.post(`${AUTH_URL}/login`, {
      data: { email: customer.email, password: customer.password },
    });
    expect(loginResponse.status()).toBe(200);
    const { accessToken } = (await loginResponse.json()) as AuthTokens;

    await hooks.advanceClock(16 * 60 * 1000);

    const response = await request.get(`${AUTH_URL}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('TOKEN_EXPIRED');
  });

  test('PLS-1.6 a valid refresh token returns a new access token', async ({ request, customer, hooks }) => {
    const loginResponse = await request.post(`${AUTH_URL}/login`, {
      data: { email: customer.email, password: customer.password },
    });
    expect(loginResponse.status()).toBe(200);
    const initialTokens = (await loginResponse.json()) as AuthTokens;

    await hooks.advanceClock(1000);

    const refreshResponse = await request.post(`${AUTH_URL}/refresh`, {
      data: { refreshToken: initialTokens.refreshToken },
    });
    expect(refreshResponse.status()).toBe(200);
    const refreshedTokens = (await refreshResponse.json()) as AuthTokens;

    expect(refreshedTokens.accessToken).toBeTruthy();
    expect(refreshedTokens.accessToken).not.toBe(initialTokens.accessToken);
    expect(refreshedTokens.refreshToken).not.toBe(initialTokens.refreshToken);
  });
});
