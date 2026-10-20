import { defineConfig, devices } from '@playwright/experimental-ct-react';

/**
 * Component testing harness (Phase 4). Component tests are yours to write (Phase 5):
 * put them next to components as `*.ct.tsx` and run `npm run test-ct`.
 * Each mount is wrapped by src/testing/ComponentHarness.tsx (see playwright/index.tsx).
 */
export default defineConfig({
  testDir: './src',
  testMatch: '**/*.ct.tsx',
  snapshotDir: './__snapshots__',
  timeout: 10_000,
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-ct-report' }]],
  use: {
    ctPort: 3100,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
