# PlayLab Shop: Phases 1 and 2

A small, realistic e-commerce site built to be tested with Playwright. This folder holds the app: a React web front end, an Express API and Postgres. The specification and acceptance criteria are in [`../tests/`](../tests/).

## Start and stop

```bash
cd app
docker compose up --build        # first run builds the images (add -d to run in the background)
docker compose down -v           # stop and wipe all data (the database volume is removed)
```

The stack is ready when `GET http://localhost:3000/api/v1/health` returns `200` with every check `up`.

If one of the ports is already in use, override it, for example `API_PORT=3001 docker compose up`. You can also copy [`.env.example`](.env.example) to `.env`.

## URLs

| What | URL |
| --- | --- |
| Shop (web) | http://localhost:5173 |
| API base | http://localhost:3000/api/v1 (also proxied at http://localhost:5173/api/v1) |
| Swagger UI | http://localhost:3000/api/docs |
| OpenAPI file | http://localhost:3000/api/openapi.json and `/api/openapi.yaml` (source: [`api/openapi/openapi.yaml`](api/openapi/openapi.yaml)) |
| Readiness (API, DB and web) | http://localhost:3000/api/v1/health |
| Liveness (API and DB only) | http://localhost:3000/api/v1/health/live |
| Test hooks | http://localhost:3000/test/* (also proxied at http://localhost:5173/test/*) |
| Test mailbox page | http://localhost:5173/mailbox?email=you@example.com |
| Admin area | http://localhost:5173/admin/orders and `/admin/products` (admin and support users) |
| Payment iframe | http://localhost:3000/pay/frame (embedded by checkout; a different origin from the shop) |
| Postgres | `postgres://playlab:playlab@localhost:5432/playlab` |

The web app proxies `/api` and `/test` to the API. A browser therefore talks to one origin, and cookies are first-party.

## Test accounts

All seeded accounts use the password **`Password123!`** and are already email-confirmed.

| Role | Email | Name |
| --- | --- | --- |
| customer | `customer@playlab.test` | Casey Customer |
| admin | `admin@playlab.test` | Alex Admin |
| support | `support@playlab.test` | Sam Support |

- **customer:** shops, sees only their own orders, and gets a **403 page** on any `/admin` URL.
- **admin:** everything, including order status changes, bulk actions, CSV export and product CRUD.
- **support:** can open the admin area and read every order, but every edit control is disabled (with a "Read-only access" tooltip), and the API returns 403 for any change.

For parallel tests, create a throwaway user per test with `POST /test/users` (any role).

## Seed data

- **40 products** in 5 categories (Electronics, Books, Home & Kitchen, Clothing, Sports), 8 per category. Notable products:

  | ID | Product | Useful for |
  | --- | --- | --- |
  | 6 | Retro Vinyl Turntable (stock 3) | "Only 3 left" |
  | 25 | O'Neill Surf Jacket | Apostrophe search |
  | 11 | O'Neill's Irish Folk Tales | Apostrophe search |
  | 35 | Sliotar, €9.00 | Fixed code larger than the cart |

  `created_at` values are fixed, so "newest" sorting is deterministic.
- **2 discount codes** in the base seed:

  | Code | Effect |
  | --- | --- |
  | `SAVE10` | 10% off goods |
  | `FIXED20` | €20 off; can also absorb delivery, total never below €0.00 |

- More codes come from `POST /test/seed` (see below).

### Money rules

- All amounts are integer cents in EUR. List prices **exclude VAT**.
- Line total = unit price × quantity.
- Subtotal = the exact sum of line totals.
- Percentage codes come off goods only. Fixed codes come off goods first, then delivery, and the total is never below €0.00.
- VAT is 23% of the **discounted** goods value.
- Delivery is a flat €4.95.
- Total = (subtotal − goods discount) + VAT + remaining delivery.

### Test cards

Use any future expiry (`MM/YY`) and any 3-digit CVC.

| Card | Result |
| --- | --- |
| `4242 4242 4242 4242` | Success (201) |
| `4000 0000 0000 0002` | Declined: 402 "Your card was declined"; no order, cart kept |
| `4000 0000 0000 0119` | Times out: waits `PAYMENT_TIMEOUT_MS` (default 5 s), then 504; no order; the UI offers Retry |

## Test hooks

Test hooks exist only when `TEST_HOOKS=true`, which is the default in `docker-compose.yml`. Start with `TEST_HOOKS=false docker compose up` and every `/test/*` path returns 404.

| Hook | What it does |
| --- | --- |
| `GET /test` | Lists the hooks and fixture names. |
| `POST /test/reset` | Truncates every table, reloads the base seed, resets the clock and the rate-limit counters. Takes about 50 ms. |
| `POST /test/seed` | Creates named fixtures; body `{ "fixtures": ["…"] }`. Returns the created ids and codes. |
| `POST /test/users` | Body `{ "role"?: "customer"\|"admin"\|"support", "name"?, "email"? }`. Returns `{ user, password, accessToken, refreshToken }`. |
| `GET /test/mailbox/{email}` | Emails the app "sent" (registration confirmation, password reset), newest first, each with a `link`. |
| `DELETE /test/mailbox/{email}` | Empties that mailbox. |
| `GET /test/clock` | Returns `{ now, offsetMs }`. |
| `POST /test/clock` | Moves the server's "now". Body `{ "now": "<ISO date>" }`, `{ "offsetMs": n }` or `{ "advanceMs": n }`; an empty body resets it. Drives JWT expiry, lockout, reset-link expiry, discount windows and order dates. |
| `POST /test/latency` | Delays matching requests. Body `{ "path": "/api/v1/products*", "method"?: "GET", "delayMs": 3000 }`. `GET` lists the rules, `DELETE` clears them. |
| `POST /test/chaos` | Makes matching requests fail. Body `{ "path", "method"?, "status"?: 500, ... }` plus exactly one of `failureRate` (0 to 1, random) or `failNext` (fail the next N, deterministic). Failures use code `CHAOS_INJECTED` and an `X-Chaos-Rule` header. `GET` lists the rules, `DELETE` clears them. |

Latency and chaos rules match the path without its query string, and `*` is the only wildcard. They apply to `/api/v1/*` and `/pay/*`, never to `/test/*` or `/health`. `POST /test/reset` clears them.

### Fixtures for `POST /test/seed`

| Fixture | Creates |
| --- | --- |
| `customer-with-orders` | A new customer with 3 orders (20, 5 and 1 days ago). Returns `user.email` and `user.password`. |
| `orders-for-admin` | 2 customers (Nora Grid, Liam Grid) with 12 orders: 3 paid, 3 processing, 3 shipped, 2 delivered and 1 cancelled. Two use `SAVE10`. |
| `customer-with-wishlist` | A customer with 4 wishlist items in a known order |
| `customer-with-avatar` | A customer who already has an avatar |
| `out-of-stock-product` | Product `FX-OOS` with stock 0 |
| `low-stock-product` | Product `FX-LOW` with stock 1 |
| `expired-discount` | `EXPIRED10`: 10% off, expired yesterday |
| `future-discount` | `FUTURE10`: 10% off, starts in 7 days |
| `single-use-discount` | `ONCE15`: 15% off, single use, not used yet |
| `used-discount` | `USED10`: single use, already used |
| `min-spend-discount` | `MIN50`: 10% off with a €50 minimum spend |

Example:

```bash
curl -X POST localhost:3000/test/reset
curl -X POST localhost:3000/test/seed -H 'Content-Type: application/json' \
     -d '{"fixtures":["expired-discount","customer-with-orders"]}'
curl -X POST localhost:3000/test/clock -H 'Content-Type: application/json' -d '{"advanceMs":960000}'
curl -X POST localhost:3000/test/chaos -H 'Content-Type: application/json' -d '{"path":"/api/v1/orders","method":"POST","failNext":1}'
```

Not built yet: `/test/bugs` (bug mode), planned for Phase 3.

## API conventions

- **Errors** always have the shape `{ "error": { "code", "message", "details" } }`. Validation failures return 422, with `details` as an array of `{ field, message }`.
- **Authentication**: send `Authorization: Bearer <accessToken>`, or rely on the httpOnly `session` cookie that `/auth/login` sets.
  - Access tokens last 15 minutes.
  - Refresh tokens last 7 days and are single use. Send one in the body of `POST /auth/refresh` or via the `refresh_token` cookie.
  - After 5 failed logins the account is locked for 15 minutes; login then returns 423 with `Retry-After`.
- **Guest carts** live in an httpOnly `cart_id` cookie. On login they merge into the account cart. If a product is in both carts it keeps the larger quantity, so quantities are never doubled.
- **Rate limit**: 100 requests a minute per user (or per IP for guests) on `/api/v1/*`, except `/health`. Over the limit returns 429 with `Retry-After`. Configure it with `RATE_LIMIT_PER_MIN`.
- **Pagination**: `GET /products` returns `meta: { page, limit, total, totalPages }` plus `Link` (`first`/`prev`/`next`/`last`) and `X-Total-Count` headers.
  - Default page size is 12, maximum 48.
  - Sorts always end with a tie-breaker on `id`.
- **Conditional reads**: `GET /products/{id}` sends an `ETag` and returns 304 on a matching `If-None-Match`.
- **Idempotency**: repeating `POST /orders` with the same `Idempotency-Key` returns the original order with status 200 and `Idempotent-Replayed: true`. Concurrent submits without a key are serialised, so only one order is created.
- **Price changes**: if a product's price changed after it was added to the cart, `POST /orders` returns 409 `PRICE_CHANGED` unless the body includes `acceptPriceChanges: true`. The checkout shows a warning and an "Accept new prices" button.
- **Order access**: customers can read only their own orders; another customer's order id returns 404. Admin and support users can read every order.
- **Admin product CRUD**: `POST/PUT/PATCH/DELETE /products` requires the admin role; other roles get 403.
- **Admin orders**:
  - `GET /orders` takes `status`, `q` (order number, email or name) and `sort`. Each order includes `customer: { id, email, name }`.
  - `PATCH /orders/{id}/status` and `POST /orders/bulk-status` (`{ ids, status }`) are admin only; support gets 403.
  - A status change emits an internal `orderStatusChanged` event, which Phase 3's WebSocket will deliver.
- **CSV export**: `GET /orders/export.csv` (admin only) downloads `orders-YYYY-MM-DD.csv`: a header row, then one row per order with the discount code and saving. It honours the grid's filters.
- **Tracking**: `GET /orders/{id}/tracking` returns a fake parcel timeline built from the order's status and dates.
- **Payments (iframe)**: the web checkout pays through a hosted frame on the API origin, as a real provider would.
  1. `POST /payments/intents` creates an intent for the current cart total and returns a `frameUrl`.
  2. The frame confirms it with `POST /pay/intents/{id}/confirm`, using the same test cards, then reports the result with `window.parent.postMessage({ type: 'playlab-payment', status, intentId })`.
  3. The shop then calls `POST /orders { paymentIntentId }`. An intent works once, only for its owner and only for the amount it was made for: otherwise 409 `PAYMENT_ALREADY_USED` or `PAYMENT_AMOUNT_MISMATCH`, or 402 if it was declined.
  - API clients can still send `payment` (card details) to `POST /orders` directly, as in Phase 1.
- **Avatars**: `POST /users/me/avatar` takes multipart field `avatar`, PNG or JPG, at most 2 MB.
  - Over 2 MB: **413 "File too large"**.
  - The type is detected from the file's first bytes, so a renamed `.exe` gets **415 "Only PNG or JPG images are allowed"**.
  - `GET /users/{id}/avatar` serves the image; `DELETE /users/me/avatar` removes it. `/auth/me` includes `avatarUrl`.
- **Wishlist**: `GET /wishlist`, `POST /wishlist/items` (409 if already there), `DELETE /wishlist/items/{productId}` and `PUT /wishlist/order { productIds }`. The reorder must list exactly the current items, otherwise 422.
- **Config**: `GET /api/v1/config` returns `{ paymentFrameUrl, testHooks }` for the web app.

## Web pages

| Path | Page |
| --- | --- |
| `/` | Home: categories and new arrivals |
| `/products` | Catalogue: search, category, min/max price, sort and pagination, all held in the URL query (`?q=&category=&minPrice=&maxPrice=&sort=&page=`) |
| `/products/:id` | Product detail |
| `/cart` | Cart: quantity stepper, remove, discount code, totals |
| `/checkout/shipping`, `/checkout/review`, `/checkout/payment` | The 3-step checkout. Each step has its own URL; entered data survives a refresh (sessionStorage; card details are never stored). Guests are sent to `/login?returnTo=…` and brought back to the same step. |
| `/orders/:id/confirmation` | Order confirmation, reached with `replace` so Back cannot resubmit |
| `/login`, `/register`, `/forgot-password`, `/reset-password?token=`, `/confirm-email?token=` | Auth pages |
| `/account`, `/account/orders/:id` | Profile and order history (newest first, dates in the browser's timezone) |
| `/mailbox?email=` | Fake inbox (needs test hooks) |
| `/wishlist` | Wishlist: drag and drop to reorder (native HTML5 drag events), or use the Move up / Move down buttons. The order is saved straight away. |
| `/track/:orderId` | Parcel tracking. Opens in a **new tab** from "Track parcel". |
| `/orders/:id/receipt` | Print receipt in a **popup window** (`window.open`), with no site chrome. It never prints by itself. |
| `/admin/orders` | Orders grid: status filter, search, pagination, select rows, inline status edit, bulk status change (confirmation modal), Export CSV |
| `/admin/products` | Product table with create and edit in a modal; Delete asks with a native `confirm()` |

## Playwright notes (Phase 2 patterns)

- **Payment iframe**: the card form is cross-origin. Use `page.frameLocator('[data-testid="payment-frame"]')`, then `getByTestId('frame-card-number')` and so on, and click `frame-pay-button`. The parent page shows `payment-declined`, `payment-timeout` (with `payment-retry-button`, which resubmits the frame) and `payment-error` (with `payment-order-retry-button` when placing the order failed after payment).
- **Native dialogs**: product delete and wishlist remove use `confirm()`. Leaving checkout for another page in the app also uses `confirm()` ("Your order is not finished. Leave checkout?"). Handle them with `page.on('dialog')`; Playwright dismisses unhandled dialogs.
- **beforeunload**: checkout pages register a `beforeunload` handler while the cart has items. Test it with `page.close({ runBeforeUnload: true })` and a `dialog` listener. Accept the dialog in tests that reload or leave mid-checkout.
- **New tab and popup**: "Track parcel" is a `target="_blank"` link, so use `context.waitForEvent('page')`. "Print receipt" calls `window.open`, so use `page.waitForEvent('popup')`.
- **Download**: "Export CSV" is a plain `<a download>`, so use `page.waitForEvent('download')`.
- **Upload**: `setInputFiles` on `avatar-input`, then click `avatar-upload-button`.
- **Hover menu**: the account menu (`account-menu-button`) opens on hover, click, Enter or ArrowDown. **Log out (`logout-button`) is inside this menu**, so open it first.
- **Tooltips**: `vat-info-button` in the totals, and every disabled control a support user sees. Hover or focus the control, and the `role="tooltip"` element appears.
- **Mobile**: under 768 px the nav collapses behind `nav-menu-button` (`aria-expanded`, `aria-controls="main-menu"`). Escape or navigating closes it.

## Locators: `data-testid` conventions

- Every link, button, input, select and textarea has a kebab-case `data-testid`.
- The markup is semantic (`header`, `nav`, `main`, `form`, `table`, labelled inputs, `role="alert"` and `role="status"` messages), so `getByRole` and `getByLabel` work as well.
- Repeated items carry an id attribute, such as `data-product-id` or `data-order-id`.
- Money values carry `data-cents` or `data-price-cents`, so you can make numeric assertions without parsing text.
- A field's error message uses the field's test id plus `-error`, for example `register-email` → `register-email-error`.

| Area | Test ids |
| --- | --- |
| Header | `nav-home`, `nav-products`, `nav-wishlist`, `nav-account`, `nav-admin`, `nav-cart`, `cart-count`, `nav-menu-button`, `main-menu`, `nav-cart-compact`, `cart-count-compact`, `nav-login`, `nav-register`, `header-search-input`, `header-search-button` |
| Account menu | `account-menu-button`, `header-user-name`, `header-avatar`, `account-menu`, `account-menu-item-account`, `account-menu-item-orders`, `account-menu-item-wishlist`, `account-menu-item-admin`, `logout-button` |
| Catalogue | `filter-search-input`, `filter-category-select`, `filter-min-price-input`, `filter-max-price-input`, `sort-select`, `filter-apply-button`, `filter-reset-button`, `result-count` (`data-count`), `product-grid`, `empty-state`, `clear-filters-link`, `pagination`, `pagination-prev`, `pagination-next`, `pagination-page-N`, `products-loading`, `products-error`, `products-retry-button` |
| Product card | `product-card` (`data-product-id`), `product-link`, `product-name`, `product-price`, `product-stock`, `add-to-cart-button`, `wishlist-toggle` (`aria-pressed`) |
| Product page | `product-title`, `product-price`, `product-stock` (`data-stock`), `product-qty-input`, `add-to-cart-button`, `add-to-cart-error`, `product-not-found` |
| Cart | `cart-table`, `cart-item` (`data-product-id`), `cart-item-name`, `cart-item-price`, `cart-item-line-total`, `qty-decrement`, `qty-input`, `qty-increment`, `cart-item-remove`, `cart-item-error`, `cart-item-price-changed`, `cart-notice`, `cart-empty`, `checkout-button` |
| Discount | `discount-code-input`, `discount-apply-button`, `discount-error`, `discount-success`, `discount-applied`, `discount-applied-code`, `discount-remove-button` |
| Totals | `totals-subtotal`, `totals-discount`, `totals-vat`, `totals-delivery`, `totals-total`, `vat-info-button`, `vat-tooltip` |
| Checkout | `checkout-step-1..3`, `shipping-full-name`, `shipping-line1` (combobox), `address-suggestions`, `address-option`, `shipping-city`, `shipping-county`, `shipping-postcode`, `shipping-phone`, `shipping-delivery-date`, `shipping-instructions`, `shipping-instructions-counter`, `shipping-continue-button`, `review-continue-button`, `price-change-warning`, `price-change-accept-button`, `payment-frame`, `payment-loading`, `payment-processing`, `payment-declined`, `payment-timeout`, `payment-retry-button`, `payment-error`, `payment-order-retry-button`, `payment-setup-error`, `test-cards` |
| Payment frame (inside the iframe) | `frame-amount`, `frame-card-name`, `frame-card-number`, `frame-card-expiry`, `frame-card-cvc` (each with `-error`), `frame-pay-button`, `frame-processing`, `frame-error`, `frame-success` |
| Orders | `order-confirmation`, `order-number`, `order-status`, `order-discount-code`, `order-discount-saving`, `order-history`, `order-row` (`data-order-id`), `order-history-empty`, `track-parcel-link`, `print-receipt-button` |
| Tracking and receipt | `tracking-page` (`data-status`), `tracking-number`, `tracking-carrier`, `tracking-status`, `tracking-event` (`data-status`), `receipt`, `receipt-order-number`, `receipt-total`, `receipt-print-button`, `receipt-close-button` |
| Account | `account-profile`, `account-name`, `avatar-section`, `avatar-image`, `avatar-placeholder`, `avatar-input`, `avatar-upload-button`, `avatar-remove-button`, `avatar-error` |
| Wishlist | `wishlist-list`, `wishlist-item` (`data-product-id`, `data-position`), `wishlist-drag-handle`, `wishlist-item-name`, `wishlist-move-up`, `wishlist-move-down`, `wishlist-add-to-cart`, `wishlist-remove`, `wishlist-status`, `wishlist-empty` |
| Admin orders | `admin-status-filter`, `admin-search-input`, `admin-search-button`, `export-csv-link`, `admin-orders-count` (`data-count`), `admin-orders-table`, `select-all`, `admin-order-row` (`data-order-id`, `data-status`), `row-select`, `admin-order-link`, `admin-order-email`, `admin-order-total`, `admin-order-status`, `admin-order-edit`, `admin-order-status-select`, `admin-order-save`, `admin-order-cancel`, `bulk-bar`, `bulk-selected-count`, `bulk-status-select`, `bulk-apply-button`, `bulk-clear-button`, `bulk-confirm-modal`, `bulk-confirm-message`, `bulk-confirm-button`, `bulk-cancel-button`, `read-only-badge`, `read-only-tooltip-*` |
| Admin products | `admin-product-search-input`, `admin-product-search-button`, `new-product-button`, `admin-products-table`, `admin-product-row` (`data-product-id`), `admin-product-price`, `admin-product-stock`, `admin-product-edit`, `admin-product-delete`, `product-modal`, `product-form-name`, `product-form-sku`, `product-form-category`, `product-form-price`, `product-form-stock`, `product-form-description`, `product-form-save`, `product-form-cancel`, `product-form-error` |
| 403 | `forbidden`, `forbidden-home-link` |
| Auth | `login-email`, `login-password`, `login-submit`, `login-error`, `register-name`, `register-name-counter`, `register-email`, `register-password`, `register-submit`, `register-success`, `forgot-password-email`, `forgot-password-submit`, `reset-password-input`, `reset-password-confirm`, `reset-password-submit`, `email-unverified-banner` |
| Mailbox | `mailbox-email-input`, `mailbox-open-button`, `mailbox-message` (`data-type`), `mailbox-subject`, `mailbox-body`, `mailbox-link` |
| Toasts | `toast-region`, `toast` (`data-type`), `toast-message`, `toast-dismiss` |

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `TEST_HOOKS` | `true` | Mount `/test/*` |
| `RATE_LIMIT_PER_MIN` | `100` | API rate limit |
| `PAYMENT_TIMEOUT_MS` | `5000` | Delay before the timeout card returns 504 |
| `JWT_SECRET` | dev value | Access-token signing key |
| `WEB_PORT` / `API_PORT` / `DB_PORT` | `5173` / `3000` / `5432` | Host ports |
| `PUBLIC_WEB_URL` | `http://localhost:5173` | Base URL used in links inside mailbox emails |
| `PAYMENT_FRAME_URL` | `http://localhost:${API_PORT}/pay/frame` | Where the browser loads the payment iframe from |
| `SHOP_ORIGINS` | `http://localhost:${WEB_PORT}` | Comma-separated origins allowed to embed the frame (`frame-ancestors`) and receive its `postMessage` results |

## Scope so far

**Phase 1:** login and session (PLS-1), registration and password reset (PLS-2.1–2.5), search and browse (PLS-3), cart (PLS-4, except 4.6), discount codes (PLS-5.1–5.8), checkout (PLS-6), order privacy (PLS-7.1–7.2), API standards (PLS-10), long, emoji and right-to-left text (PLS-11.3), and the test environment (PLS-12.1, 12.2, 12.4).

**Phase 2:**
- discount on the confirmation and CSV export (PLS-5.9)
- payment in an iframe (PLS-6.1–6.3) and the leave-checkout warning (6.6)
- 403 page for customers (PLS-7.5)
- admin grid filter, inline edit, bulk change, product CRUD and support read-only (PLS-8.1, 8.3–8.5)
- PLS-8.2's save (its WebSocket event comes in Phase 3)
- avatar upload and CSV export (PLS-9)
- burger menu (PLS-11.4)
- wishlist drag-and-drop, modals, tooltips, hover menu, new tab and popup
- `/test/latency` and `/test/chaos`

**Not built yet** (Phase 3 in the spec):
- WebSocket and SSE (7.4, 8.2's event, 8.6)
- shadow DOM review stars and reviews (11.2)
- infinite scroll
- EUR/GBP switch (4.6), Irish language (11.5) and timezones (7.3)
- planted a11y faults (2.6, 11.1)
- bug mode (12.3)
- theme toggle
- offline message (11.6)

## Where this differs from or adds to the spec

1. `docker-compose.yml` lives in `app/`, so run Compose from there.
2. Guests can use the cart without logging in (a cookie cart), although the spec's API table lists `/cart` as customer only. PLS-4.5 (guest cart merge) needs this.
3. On merge, a product in both carts keeps the larger quantity; quantities are never summed.
4. A locked account returns **423** (as in PLS-1.3). The 5th wrong password still returns 401 and sets the lock.
5. Login does not require a confirmed email. Unconfirmed users see a banner on their account page.
6. Prices exclude VAT, and VAT is shown as its own line. Fixed codes can also absorb delivery, so PLS-5.6 reaches €0.00.
7. The timeout card returns 504 after a configurable delay.
8. Unknown, expired, not-yet-active, already-used, min-spend and empty-cart codes return 422; "Only one code per order" returns 409.
9. Payment (step 3) is now a cross-origin iframe. **Phase 1's `card-*` fields and `checkout-pay-button` are gone from the shop page**, and their equivalents live inside the frame (`frame-*`). `POST /orders` still accepts card details directly for API tests.
10. Phase 1 adds `/test/users`, `/test/mailbox` and `/test/clock` beyond the spec's reset and seed, because the Phase 1 ACs need them. It also adds `/api/v1/health/live`, because the web container waits on the API and `/health` also checks the web app.
11. The delivery date picker is the native `<input type="date">`.
12. `/api/v1/addresses/suggest` (address autocomplete against a fixed list of Irish addresses) and `/api/v1/categories` are extra endpoints.
13. Price filters (`minPrice`, `maxPrice`) are in **euros**, while all response amounts are in cents.
14. Phase 2 adds `/test/latency` and `/test/chaos` (which the spec lists) with a deterministic `failNext` option. It also adds 3 fixtures and these endpoints: `/orders/{id}/tracking`, `/orders/bulk-status`, `/payments/intents`, `/pay/*`, `/wishlist/*` and `/config`.
15. Log out now lives inside the account hover menu (`account-menu-button` → `logout-button`).
16. Support users can see the admin grid but not export CSV: the spec lists the export as admin only.
17. The leave-checkout warning also covers navigation inside the app (with a `confirm()`), not only `beforeunload`. It never fires between checkout steps, on the way to the confirmation, or on a redirect to login.
18. Order status changes have no transition rules yet: an admin can set any status, including moving a delivered order back to paid.
