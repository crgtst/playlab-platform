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
objects. `specs/orders/orders.spec.ts` covers PLS-7.1 through PLS-7.5: customer-only history in newest-first order,
cross-customer 404 access control, browser-local order dates, live status updates, and the customer-facing 403 page.
Defect-mode checks exercise `order-leak` and `timezone-off-by-one`; `pages/OrdersPage.ts` provides order-history
locators. `specs/admin/admin.spec.ts` covers PLS-8.1 through PLS-8.6: status filtering, inline and bulk status changes,
live order updates, product CRUD, support-user restrictions, and live stock updates. Its defect-mode check exercises
`stale-stock`; `pages/AdminPage.ts` provides admin navigation and grid locators.
`specs/api/standards.spec.ts` covers PLS-10.1–10.3 and PLS-10.5–10.6: consistent error envelopes and correlation IDs,
validation status, rate limiting, order idempotency, and conditional product reads. The `wrong-status-code` defect is
checked explicitly. PLS-10.4 is covered by the API integration schema journey in `app/api/test/integration/schemas.int.test.ts`,
which validates more than 80 responses against the documented OpenAPI status and schema.
`specs/accessibility/accessibility.spec.ts` covers PLS-11.1–11.6: axe scans on the home, product, cart and checkout
pages in both themes; escaped review content; long, emoji and right-to-left customer names; mobile navigation; Irish
translations; and offline recovery. Axe scans emulate reduced motion so theme transitions cannot produce transient
colors during contrast checks.
`specs/account/avatar.spec.ts` covers PLS-9.1–9.4: PNG and JPG avatar upload (checked against the bytes served back),
the 2 MB limit (413 and "File too large"), content-based rejection of a renamed non-image (415), and the admin order
CSV export (header row plus one row per order, following the admin search filter). A defect-mode check exercises
`upload-extension-only`; `pages/AccountPage.ts` provides the avatar locators.
`specs/browser/` covers the browser-capability stories PLS-13 to PLS-19, one file each. `stores.spec.ts` (PLS-13) drives
the store finder with the context's geolocation and permissions, with `geolocation-ignored` and
`permission-denied-crash` defect checks. `notifications.spec.ts` (PLS-14) and `battery.spec.ts` (PLS-16) use the
stand-ins in `support/browser.ts`, which replace `Notification` and the Battery API; defect checks cover
`notification-spam` and `battery-banner-stuck`. `clipboard.spec.ts` (PLS-15) reads the real clipboard, and
checks `clipboard-wrong-value`. `offline.spec.ts` (PLS-17) turns service workers on for its offline tests (the suite
blocks them by default), uses a product created for the test so its price can change, and checks
`offline-stale-prices`. `gallery.spec.ts` (PLS-18) sends real touch input through the DevTools protocol (`swipe`) and
`structure.spec.ts` (PLS-19) holds the approved aria snapshots of the product card and the header, plus the heading
levels of the order summary with an `aria-heading-skip` check. `support/orders.ts` creates, moves and cancels test
orders through the API; `pages/StoresPage.ts` holds the store-finder locators.
`specs/orders/lifecycle.spec.ts` covers PLS-20.1–20.6: one-step status moves, the 409 `INVALID_TRANSITION` body, the
all-or-nothing bulk change, restocking on cancel and customer cancellation, with `status-any-transition` checks.
`specs/orders/locking.spec.ts` covers PLS-21.1–21.7: `If-Match` on products and order status (200, 412, 428), order
ETags, the 20-customer race for the last item and the two-admin stale grid message, with `lost-update` and
`stock-oversell` checks. Both use seeded products no other spec orders (`HK-005`, `HK-006`, `HK-008`, `SP-004`) and
put their stock back in `afterAll`, because a shipped or delivered order cannot be cancelled. A product that has been
ordered cannot be deleted, so these specs never create products to order; `support/products.ts` holds the helpers for
products a test creates and deletes itself.
`specs/account/profile.spec.ts` covers PLS-22.1–22.6: renaming (checked in the header), changing the email with the
current password, a wrong password, deleting the account on two devices, anonymised orders and an email already in use.
`specs/admin/users.spec.ts` covers PLS-23.1–23.5: user list filters and paging (each test finds its own users by a
unique name), role changes from the next login, unlocking, and the support and customer limits.
`specs/security/api-security.spec.ts` covers the PLS-24 criteria that hold today: object level authorisation (24.1),
forged and expired access tokens (24.2), identical responses for known and unknown emails (24.3), a registration
`role` field being ignored (24.4), the rate limit against `X-Forwarded-For` (24.6), the page limit (24.7), the admin
user routes (24.8), a single-use code raced by two orders (24.9) and the retired v0 route (24.13). Defect checks:
`order-leak`, `token-never-expires`, `rate-limit-bypass` and `single-use-reused`. PLS-24.5, 24.10, 24.11, 24.12 and
24.14 are not built yet, so they have no tests here.
`specs/observability/observability.spec.ts` covers PLS-25.1–25.5: correlation IDs, the log line and its fields, redaction
of passwords, tokens, cookies and card details, and the metrics (counters are shared by every test, so these check "at
least", and the defects gauge follows the scraping session). `specs/environment/sessions.spec.ts` covers PLS-28.1,
28.6, 28.7 and 28.10: sessions kept apart (defects, chaos rules, clocks), the session id and cookie, per-session latency
and rate limits, and the payment frame following the shop's session. Not tested from here: PLS-28.3 and 28.4 (bulk
data) and 28.5 (the start-up guard) are not built or need a restarted API, and PLS-28.8 needs an hour of real time.

## Tests that need the stack to themselves

`specs/exclusive/` has its own Playwright project, `exclusive`. A reset ends every session and wipes the data, and
exact counter checks and no-session global defects are broken by (and break) tests running beside them. The project
runs after `chromium` in a normal `npm test`, and is skipped if that has failures; run it alone with
`npm run test:exclusive`. It holds PLS-25.5 (exact counters), PLS-28.2 (global state with no session) and PLS-28.9
(reset). A new test goes there only if it needs the whole stack; everything else should use its own test session.

`browser.newContext()` copies the test's `X-Test-Session` header into the new context. A second browser that should
have no session needs `extraHTTPHeaders: {}`.
