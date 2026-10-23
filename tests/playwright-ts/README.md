# Playwright (TypeScript)

The canonical suite: every AC, every browser project. Phase 2.

Planned techniques: page objects, role fixtures, a `storageState` setup project, 4 browser projects, sharding, tags, a
custom matcher, an AC traceability reporter, visual (`toHaveScreenshot`) and axe checks, and Playwright `request`
tests for API setup and checks. Component tests, UI mode and the test agents are Node-only, so they live here alone.

Showcase: the **defect matrix**, where CI switches on each defect in turn and shows which tests went red.

Not to be confused with `app/e2e/`, the platform's own smoke suite.

## Running it

Start the stack from `app/` (`docker compose up --build -d`), then:

```bash
cd tests/playwright-ts
npm install
npx playwright install chromium   # first time only
npm test                          # all specs; npm run test:ui for UI mode
npm run report                    # open the last HTML report
```

The suite finds the stack from `app/.env` (`API_PORT`, `WEB_PORT`); set `API_URL` or `WEB_URL` to override. Results
go to `playwright-report/` (HTML) and `results/junit.xml` (for the traceability report).

## Layout

| Path | What it holds |
| --- | --- |
| `specs/<feature>/*.spec.ts` | Tests grouped by feature/story area. Each test name starts with its AC ID: `PLS-1.8 an expired session ...` |
| `pages/` | Page objects (`LoginPage`, `ProductPage`, `Header`). Keep the names and methods the same in every language |
| `support/fixtures.ts` | The `test` to import. Gives every test its own test session and a throwaway `customer` |
| `support/hooks.ts` | The API's test hooks: sessions, throwaway users, the clock |
| `support/data.ts` | The shared data contract in `tests/shared/` (accounts, products, cards, discounts, fixtures) |
| `support/env.ts` | Where the stack is |

## Isolation, so tests can run in parallel

Every test runs in its own **test session**: the fixtures add an `X-Test-Session` header to every request the page
and the `request` fixture make, so the clock, defects, latency and chaos rules a test sets apply to it alone. Every
test that needs an account gets a new one from `POST /test/users` (the `customer` fixture), so carts and orders
never collide.

Don't call `POST /test/reset` from a test: it ends every session, including those of tests running beside it. To
turn a defect on for one test, call `POST /test/bugs` through the `request` fixture, which carries the session header.

## Current coverage

`specs/auth/login.spec.ts` covers PLS-1.1 through PLS-1.6: successful and failed login, account lockout, logout,
access-token expiry and refresh. `specs/auth/session.spec.ts` covers PLS-1.7 and PLS-1.8: checkout recovery after an
expired session, and guest-cart fallback when both session tokens have expired.
`specs/registration/registration.spec.ts` covers PLS-2.1 through PLS-2.4 and PLS-2.6, including the mapped
`fada-rejected`, `wrong-status-code` and `missing-label` defects.
`specs/registration/password-reset.spec.ts` covers PLS-2.5, including mailbox delivery and expiry of the reset link.
`specs/catalogue/browse.spec.ts` covers PLS-3.1 through PLS-3.6, including full-catalogue sort and pagination checks
and defect-mode checks for `search-apostrophe` and `pagination-duplicate`. `specs/cart/cart.spec.ts` covers PLS-4.1
through PLS-4.7, including invalid quantities, stock limits, exact cent totals, account-cart merging, currency
switching and price-change warnings. Its defect-mode checks exercise `quantity-negative`, `stock-oversell`,
`cart-total-rounding` and `currency-switch-stale`. `specs/discounts/codes.spec.ts` covers PLS-5.1 through PLS-5.11,
including discount validation, exact discounted order totals, VAT, confirmation and CSV export. Its defect-mode
checks exercise `discount-not-applied`, `expired-discount-accepted`, `single-use-reused`, `discount-stacking`,
`discount-survives-cart-change`, `discount-negative-total`, `discount-case-sensitive` and `vat-before-discount`. The
percentage (`SAVE10`) and fixed-amount (`FIXED20`) codes share application, defect, normalization, VAT, exact-total, and
order-confirmation/CSV-export coverage; PLS-5.11 explicitly checks the fixed discount's exact saving and checkout total.
`specs/checkout/checkout.spec.ts` covers PLS-6.1 through PLS-6.9: the three checkout steps, success, decline and timeout
cards, one-order double-click handling, browser-back safety, in-app and browser leave warnings, server-side price
integrity, payment-button stability, and keyboard-only completion. Defect-mode checks exercise `double-submit`,
`price-tamper` and `button-moves`. `pages/CartPage.ts` and `pages/CheckoutPage.ts` provide the cart and checkout page
objects.
