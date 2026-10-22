import { defineConfig } from 'vitest/config';

// Integration tests use their own database, so a run never touches the stack's data.
// Override with TEST_DATABASE_URL; otherwise the Compose db on DB_PORT is used. Workers inherit it.
process.env.TEST_DATABASE_URL ??= `postgres://playlab:playlab@localhost:${process.env.DB_PORT ?? '5432'}/playlab_test`;

// App tests (finding A11). Unit tests need nothing running; integration tests need Postgres.
export default defineConfig({
  test: {
    environment: 'node',
    // Request logs still reach GET /test/logs; they just stay off the test output.
    env: { LOG_LEVEL: 'silent' },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['test/**/*.test.ts'], exclude: ['test/**/*.int.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.int.test.ts'],
          globalSetup: ['test/integration/global-setup.ts'],
          setupFiles: ['test/integration/setup.ts'],
          // One database, so one file at a time.
          fileParallelism: false,
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL,
            TEST_HOOKS: 'true',
            LOG_LEVEL: 'silent',
            // A documentation-only address, so supertest's loopback requests count as untrusted clients (A7).
            TRUSTED_PROXIES: '192.0.2.1',
            // Nothing listens here, so readiness reports the web app as down.
            WEB_URL: 'http://127.0.0.1:9',
          },
        },
      },
    ],
  },
});
