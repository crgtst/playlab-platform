# PlayLab Shop: Phase 1

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
| Postgres | `postgres://playlab:playlab@localhost:5432/playlab` |

The web app proxies `/api` and `/test` to the API. A browser therefore talks to one origin, and cookies are first-party.

## Test accounts

All seeded accounts use the password **`Password123!`** and are already email-confirmed.

| Role | Email | Name |
| --- | --- | --- |
| customer | `customer@playlab.test` | Casey Customer |
| admin | `admin@playlab.test` | Alex Admin |
| support | `support@playlab.test` | Sam Support |

For parallel tests, create a throwaway user per test with `POST /test/users`.

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
| `GET /test` | Lists the hooks and fixture names. The web footer uses it to decide whether to show the mailbox link. |
| `POST /test/reset` | Truncates every table, reloads the base seed, resets the clock and the rate-limit counters. Takes about 50 ms. |
| `POST /test/seed` | Creates named fixtures; body `{ "fixtures": ["…"] }`. Returns the created ids and codes. |
| `POST /test/users` | Body `{ "role"?: "customer"\|"admin"\|"support", "name"?, "email"? }`. Returns `{ user, password, accessToken, refreshToken }`. |
| `GET /test/mailbox/{email}` | Emails the app "sent" (registration confirmation, password reset), newest first, each with a `link`. |
| `DELETE /test/mailbox/{email}` | Empties that mailbox. |
| `GET /test/clock` | Returns `{ now, offsetMs }`. |
| `POST /test/clock` | Moves the server's "now". Body `{ "now": "<ISO date>" }`, `{ "offsetMs": n }` or `{ "advanceMs": n }`; an empty body resets it. Drives JWT expiry, lockout, reset-link expiry, discount windows and order dates. |

### Fixtures for `POST /test/seed`

| Fixture | Creates |
| --- | --- |
| `customer-with-orders` | A new customer with 3 orders (20, 5 and 1 days ago). Returns `user.email` and `user.password`. |
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
```

Not built yet: `/test/latency`, `/test/chaos` and `/test/bugs` (bug mode). They are planned for Phases 2 and 3.

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
- **Admin product CRUD**: `POST/PUT/PATCH/DELETE /products` requires the admin role; other roles get 403. Phase 1 has the API only; the admin UI comes in Phase 2.

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

## Locators: `data-testid` conventions

- Every link, button, input, select and textarea has a kebab-case `data-testid`.
- The markup is semantic (`header`, `nav`, `main`, `form`, `table`, labelled inputs, `role="alert"` and `role="status"` messages), so `getByRole` and `getByLabel` work as well.
- Repeated items carry an id attribute, such as `data-product-id` or `data-order-id`.
- Money values carry `data-cents` or `data-price-cents`, so you can make numeric assertions without parsing text.
- A field's error message uses the field's test id plus `-error`, for example `register-email` → `register-email-error`.

| Area | Test ids |
| --- | --- |
| Header | `nav-home`, `nav-products`, `nav-account`, `nav-cart`, `cart-count`, `header-user-name`, `logout-button`, `nav-login`, `nav-register`, `header-search-input`, `header-search-button` |
| Catalogue | `filter-search-input`, `filter-category-select`, `filter-min-price-input`, `filter-max-price-input`, `sort-select`, `filter-apply-button`, `filter-reset-button`, `result-count` (`data-count`), `product-grid`, `empty-state`, `clear-filters-link`, `pagination`, `pagination-prev`, `pagination-next`, `pagination-page-N`, `products-loading`, `products-error`, `products-retry-button` |
| Product card | `product-card` (`data-product-id`), `product-link`, `product-name`, `product-price`, `product-stock`, `add-to-cart-button` |
| Product page | `product-title`, `product-price`, `product-stock` (`data-stock`), `product-qty-input`, `add-to-cart-button`, `add-to-cart-error`, `product-not-found` |
| Cart | `cart-table`, `cart-item` (`data-product-id`), `cart-item-name`, `cart-item-price`, `cart-item-line-total`, `qty-decrement`, `qty-input`, `qty-increment`, `cart-item-remove`, `cart-item-error`, `cart-item-price-changed`, `cart-notice`, `cart-empty`, `checkout-button` |
| Discount | `discount-code-input`, `discount-apply-button`, `discount-error`, `discount-success`, `discount-applied`, `discount-applied-code`, `discount-remove-button` |
| Totals | `totals-subtotal`, `totals-discount`, `totals-vat`, `totals-delivery`, `totals-total` |
| Checkout | `checkout-step-1..3`, `shipping-full-name`, `shipping-line1` (combobox), `address-suggestions`, `address-option`, `shipping-city`, `shipping-county`, `shipping-postcode`, `shipping-phone`, `shipping-delivery-date`, `shipping-instructions`, `shipping-instructions-counter`, `shipping-continue-button`, `review-continue-button`, `price-change-warning`, `price-change-accept-button`, `card-name`, `card-number`, `card-expiry`, `card-cvc`, `checkout-pay-button`, `payment-declined`, `payment-timeout`, `payment-retry-button`, `payment-error` |
| Orders | `order-confirmation`, `order-number`, `order-status`, `order-discount-code`, `order-discount-saving`, `order-history`, `order-row` (`data-order-id`), `order-history-empty` |
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

## Phase 1 scope

**Built:** login and session (PLS-1), registration and password reset (PLS-2.1–2.5), search and browse (PLS-3), cart (PLS-4, except 4.6), discount codes (PLS-5.1–5.8, and the confirmation half of 5.9), checkout (PLS-6, except 6.6), order privacy (PLS-7.1–7.2), API standards (PLS-10), long, emoji and right-to-left text (PLS-11.3), and the test environment (PLS-12.1, 12.2, 12.4).

**Not built yet** (Phase 2/3 in the spec):
- iframe payment form
- `beforeunload` warning (6.6)
- roles UI, admin grid and 403 page (7.5, PLS-8)
- uploads and CSV export (PLS-9, 5.9 export half)
- WebSocket and SSE (7.4, 8.6)
- EUR/GBP switch (4.6), Irish language (11.5) and timezone defect (7.3)
- reviews (11.2)
- burger menu (11.4) and offline message (11.6)
- planted a11y faults (2.6, 11.1)
- bug mode (12.3)

## Where this differs from or adds to the spec

1. `docker-compose.yml` lives in `app/`, so run Compose from there.
2. Guests can use the cart without logging in (a cookie cart), although the spec's API table lists `/cart` as customer only. PLS-4.5 (guest cart merge) needs this.
3. On merge, a product in both carts keeps the larger quantity; quantities are never summed.
4. A locked account returns **423** (as in PLS-1.3). The 5th wrong password still returns 401 and sets the lock.
5. Login does not require a confirmed email. Unconfirmed users see a banner on their account page.
6. Prices exclude VAT, and VAT is shown as its own line. Fixed codes can also absorb delivery, so PLS-5.6 reaches €0.00.
7. The timeout card returns 504 after a configurable delay.
8. Unknown, expired, not-yet-active, already-used, min-spend and empty-cart codes return 422; "Only one code per order" returns 409.
9. Payment (step 3) is an inline form for now; the spec's iframe arrives in Phase 2.
10. Phase 1 adds `/test/users`, `/test/mailbox` and `/test/clock` beyond the spec's reset and seed, because the Phase 1 ACs need them. It also adds `/api/v1/health/live`, because the web container waits on the API and `/health` also checks the web app.
11. The delivery date picker is the native `<input type="date">`.
12. `/api/v1/addresses/suggest` (address autocomplete against a fixed list of Irish addresses) and `/api/v1/categories` are extra endpoints.
13. Price filters (`minPrice`, `maxPrice`) are in **euros**, while all response amounts are in cents.
