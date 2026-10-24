import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import type { Response } from '@playwright/test';
import { Header } from '../../pages/Header';
import { LoginPage } from '../../pages/LoginPage';
import { RegisterPage } from '../../pages/register-page';
import { accounts } from '../../support/data';
import { API_URL, expect, test } from '../../support/fixtures';

const AUTH_URL = `${API_URL}/api/v1/auth`;

function uniqueEmail() {
  return `playwright-${randomUUID()}@playlab.test`;
}

function isAuthResponse(response: Response, endpoint: string) {
  return new URL(response.url()).pathname === `/api/v1/auth/${endpoint}` && response.request().method() === 'POST';
}

test.describe('PLS-2 Registration and password reset', () => {
  test('PLS-2.1 registration creates an account and sends a confirmation email', async ({ page, hooks }) => {
    const registration = new RegisterPage(page);
    const email = uniqueEmail();

    await registration.goto();
    const responsePromise = page.waitForResponse((response) => isAuthResponse(response, 'register'));
    await registration.register({ name: 'Playwright New Customer', email, password: 'Password123!' });

    const response = await responsePromise;
    expect(response.status()).toBe(201);
    await expect(registration.success).toBeVisible();
    await expect(page.getByTestId('register-success-email')).toHaveText(email);

    const mailbox = await hooks.mailbox(email);
    expect(mailbox).toHaveLength(1);
    expect(mailbox[0]).toMatchObject({ to: email, type: 'confirm-email' });
    if (!mailbox[0]?.link) throw new Error('No confirmation link appeared in the test mailbox');
    expect(mailbox[0].link).toContain('/confirm-email?token=');
  });

  test('PLS-2.2 registering an existing email shows the conflict and returns 409', async ({ page }) => {
    const registration = new RegisterPage(page);

    await registration.goto();
    const responsePromise = page.waitForResponse((response) => isAuthResponse(response, 'register'));
    await registration.register({
      name: 'Existing Customer',
      email: accounts.customer.email,
      password: 'Password123!',
    });

    const response = await responsePromise;
    expect(response.status()).toBe(409);
    await expect(registration.emailError).toHaveText('An account with this email already exists');
  });

  for (const name of ['Seán', 'Aoife Ní Bhriain']) {
    test(`PLS-2.3 ${name} is accepted and displayed correctly`, async ({ page }) => {
      const registration = new RegisterPage(page);
      const login = new LoginPage(page);
      const header = new Header(page);
      const email = uniqueEmail();
      const password = 'Password123!';

      await registration.goto();
      const responsePromise = page.waitForResponse((response) => isAuthResponse(response, 'register'));
      await registration.register({ name, email, password });

      const response = await responsePromise;
      expect(response.status()).toBe(201);
      await expect(registration.success).toBeVisible();

      await registration.loginLink.click();
      await login.logIn({ email, password });
      await expect(header.userName).toHaveText(name);
    });
  }

  test('PLS-2.3 the fada-rejected defect blocks accented registration', async ({ page, request }) => {
    const bugResponse = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['fada-rejected'] } });
    expect(bugResponse.status()).toBe(200);

    const registration = new RegisterPage(page);
    await registration.goto();
    await registration.register({ name: 'Seán', email: uniqueEmail(), password: 'Password123!' });

    await expect(registration.nameError).toHaveText('Name contains invalid characters');
  });

  test('PLS-2.4 a short password shows an inline error and the API returns 422', async ({ page, request }) => {
    const registration = new RegisterPage(page);
    await registration.goto();
    await registration.register({ name: 'Short Password', email: uniqueEmail(), password: 'short' });

    await expect(registration.passwordError).toHaveText('Password must be at least 8 characters');

    const response = await request.post(`${AUTH_URL}/register`, {
      data: { name: 'Short Password', email: uniqueEmail(), password: 'short' },
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
  });

  test('PLS-2.4 the wrong-status-code defect changes invalid registration to 500', async ({ request }) => {
    const bugResponse = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['wrong-status-code'] } });
    expect(bugResponse.status()).toBe(200);

    const response = await request.post(`${AUTH_URL}/register`, {
      data: { name: 'Short Password', email: uniqueEmail(), password: 'short' },
    });
    expect(response.status()).toBe(500);
  });

  test('PLS-2.6 the registration email field has an accessible label', async ({ page }) => {
    await page.goto('/register');

    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();

    const results = await new AxeBuilder({ page }).withRules(['label']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('PLS-2.6 the missing-label defect is detected by axe', async ({ page, request }) => {
    const bugResponse = await request.post(`${API_URL}/test/bugs`, { data: { enable: ['missing-label'] } });
    expect(bugResponse.status()).toBe(200);

    await page.goto('/register');
    const results = await new AxeBuilder({ page }).withRules(['label']).analyze();

    expect(results.violations.some((violation) => violation.nodes.some((node) => node.target.includes('#register-email')))).toBe(
      true,
    );
  });
});
