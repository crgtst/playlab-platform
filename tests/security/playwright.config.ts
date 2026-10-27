import { defineConfig } from '@playwright/test';

/**
 * API tests only: no browser. Run against a stack started from app/ with `docker compose up --build -d`.
 * Every test runs in its own test session (support/fixtures.ts), so a defect switched on for one test reaches no other.
 *
 * DEFECTS=name,name switches those defects on for every test whose title does not start a defect story ("defect ..."), which is
 * how `npm run test:defects` proves each secure test fails with its defect on.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: [
    ['list'],
    // The input to the traceability report and the security test report.
    ['junit', { outputFile: process.env.JUNIT_FILE ?? 'results/junit.xml' }],
  ],
});
