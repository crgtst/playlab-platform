import { defineConfig, devices } from '@playwright/test';
import { WEB_URL } from './support/env';

/**
 * Runs against a stack already started from app/ with `docker compose up --build -d`.
 * Every test runs in its own test session with its own user (support/fixtures.ts), so tests run in parallel.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    // The input to the traceability report: every test name starts with its AC ID.
    ['junit', { outputFile: 'results/junit.xml' }],
  ],
  use: {
    baseURL: WEB_URL,
    // The shop's service worker answers some requests itself, before page.route can see them.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // One browser for now. The plan has four projects (Chromium, Firefox, WebKit, mobile); add them here.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
