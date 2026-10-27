import { defineConfig } from 'vitest/config';

// Pact consumer tests: they run the web app's own API client in Node against a Pact mock server.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['pact/**/*.pact.test.ts'],
    testTimeout: 30_000,
  },
});
