import { request as playwrightRequest, test as base } from '@playwright/test';
import { API_URL } from './env';
import { TestHooks, TestUser } from './hooks';

interface Fixtures {
  testSession: string;
  hooks: TestHooks;
  customer: TestUser;
  /** Switches DEFECTS on for the test, unless the test is a defect story. Needs no use in a test. */
  forcedDefects: void;
}

/** The defects `npm run test:defects` forces on, from DEFECTS=a,b. */
const FORCED = (process.env.DEFECTS ?? '')
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

export const test = base.extend<Fixtures>({
  testSession: async ({}, use) => {
    const ctx = await playwrightRequest.newContext();
    const id = await new TestHooks(ctx).startSession();
    await ctx.dispose();
    await use(id);
  },

  extraHTTPHeaders: async ({ testSession }, use) => {
    await use({ 'X-Test-Session': testSession });
  },

  hooks: async ({ request }, use) => {
    await use(new TestHooks(request));
  },

  customer: async ({ hooks }, use) => {
    await use(await hooks.createUser('customer'));
  },

  forcedDefects: [
    async ({ hooks }, use, testInfo) => {
      // A defect story switches on its own defect. The secure tests are the ones the matrix breaks on purpose.
      if (!/(^| )defect /.test(testInfo.title)) await hooks.enableDefects(...FORCED);
      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
export { API_URL };
