import { defineConfig } from 'vitest/config';

// App unit tests (finding A11): pricing, bug isolation and hooks. They need no database or running stack.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
