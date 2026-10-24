import { randomUUID } from 'node:crypto';
import type { Response } from '@playwright/test';
import { ForgotPasswordPage } from '../../pages/forgot-password-page';
import { ResetPasswordPage } from '../../pages/reset-password-page';
import { expect, test } from '../../support/fixtures';

function isForgotPasswordResponse(response: Response) {
  return new URL(response.url()).pathname === '/api/v1/auth/forgot-password' && response.request().method() === 'POST';
}

test('PLS-2.5 a reset link appears in the mailbox and expires after one hour', async ({ page, customer, hooks }) => {
  const forgotPassword = new ForgotPasswordPage(page);
  const resetPassword = new ResetPasswordPage(page);
  const email = customer.email;

  await forgotPassword.goto();
  const responsePromise = page.waitForResponse(isForgotPasswordResponse);
  await forgotPassword.requestReset(email);

  const response = await responsePromise;
  expect(response.status()).toBe(202);
  await expect(forgotPassword.sent).toContainText('It expires in 1 hour.');

  const messages = await hooks.mailbox(email);
  const resetMessage = messages.find((message) => message.type === 'password-reset');
  if (!resetMessage?.link) throw new Error('No password-reset link appeared in the test mailbox');
  expect(resetMessage.link).toContain('/reset-password?token=');

  await hooks.advanceClock(61 * 60 * 1000);
  await resetPassword.goto(resetMessage.link);
  await resetPassword.submitNewPassword(`New-${randomUUID()}!`);

  await expect(resetPassword.error).toHaveText('This reset link has expired');
});
