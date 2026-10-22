import { request as playwrightRequest, test as base } from '@playwright/test';
import { API_URL } from './env';
import { TestHooks, TestUser } from './hooks';

/**
 * Isolation, so tests can run in parallel:
 * - each test gets its own test session, and every request it makes (browser and API) carries the session's
 *   X-Test-Session header, so clock moves and defects stay inside the test;
 * - `customer` is a fresh throwaway account, so no two tests share a cart.
 */
interface Fixtures {
  testSession: string;
  hooks: TestHooks;
  customer: TestUser;
}

export const test = base.extend<Fixtures>({
  testSession: async ({}, use) => {
    const ctx = await playwrightRequest.newContext();
    const id = await new TestHooks(ctx).startSession();
    await ctx.dispose();
    await use(id);
  },

  // Overrides the built-in option, so the page and the request fixture both send the header.
  extraHTTPHeaders: async ({ testSession }, use) => {
    await use({ 'X-Test-Session': testSession });
  },

  hooks: async ({ request }, use) => {
    await use(new TestHooks(request));
  },

  customer: async ({ hooks }, use) => {
    await use(await hooks.createUser('customer'));
  },
});

export { expect } from '@playwright/test';
export { API_URL };
