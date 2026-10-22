// Repo-wide ESLint config (flat). Run from the repo root: npm run lint.
// Rules are syntax-only (no type information), so linting stays fast enough for the pre-commit hook;
// tsc in each app is the type gate.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    'app/web/playwright/.cache/',
    'app/web/playwright-ct-report/',
    'app/web/test-results/',
    // Test suites are written by hand as training; each suite brings its own lint setup.
    'tests/',
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Warn, not error: the API's pg rows are untyped (`any`) until row types are added.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // API: Node, CommonJS output
  {
    files: ['app/api/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Web app: browser + React hooks
  {
    files: ['app/web/src/**/*.{ts,tsx}', 'app/web/playwright/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['app/web/*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['app/web/public/sw.js'],
    languageOptions: { sourceType: 'script', globals: globals.serviceworker },
  },

  // Chrome extension: classic scripts with the chrome.* API
  {
    files: ['app/extensions/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, ...globals.webextensions } },
  },

  // Must be last: turns off rules that clash with Prettier.
  prettier,
);
