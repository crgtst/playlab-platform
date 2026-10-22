import { defineConfig, devices } from '@playwright/test';
import { WEB_URL } from './env';

/**
 * Platform smoke suite: proves UI behaviour of the app itself, against a running Compose stack.
 * Test state (defects, clock, chaos) is global until test sessions exist, so tests run one at a time.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    // The service worker answers requests before page.route and the network emulation see them.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'smoke', grepInvert: /@gate1/, use: { ...devices['Desktop Chrome'] } },
    // Screenshot baselines for Gate 1 (existing UI unchanged). Run on purpose, not in CI.
    { name: 'gate1', grep: /@gate1/, use: { ...devices['Desktop Chrome'] } },
  ],
});
