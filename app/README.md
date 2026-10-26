# PlayLab Shop

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
| Metrics (Prometheus) | http://localhost:3000/metrics |
| Test hooks | http://localhost:3000/test/* (also proxied at http://localhost:5173/test/*) |
| Test mailbox page | http://localhost:5173/mailbox?email=you@example.com |
| Admin area | http://localhost:5173/admin/orders and `/admin/products` (admin and support users) |
| Payment iframe | http://localhost:3000/pay/frame (embedded by checkout; a different origin from the shop) |
| Live order status (WebSocket) | ws://localhost:5173/ws/orders (proxied) or ws://localhost:3000/ws/orders |
| Live stock (Server-Sent Events) | http://localhost:5173/api/v1/stock/stream?ids=1,2 |
| New arrivals (infinite scroll) | http://localhost:5173/new-arrivals |
| Store finder (geolocation) | http://localhost:5173/stores |
| Service worker | http://localhost:5173/sw.js (registered by the production build that Docker serves) |
| Price-tracker extension | [`extensions/price-tracker/`](extensions/price-tracker/) (load it unpacked) |
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

For parallel tests, create a throwaway user per test with `POST /test/users` (any role), and give each worker its own [test session](#test-sessions) for defects, the clock and injected faults.

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
| `POST /test/sessions` | Starts an isolated test session and returns `{ id, idleTimeoutMs }`. See [Test sessions](#test-sessions). |
| `POST /test/seed` | Creates named fixtures; body `{ "fixtures": ["…"] }`. Returns the created ids and codes. |
| `POST /test/users` | Body `{ "role"?: "customer"\|"admin"\|"support", "name"?, "email"? }`. Returns `{ user, password, accessToken, refreshToken }`. |
| `GET /test/mailbox/{email}` | Emails the app "sent" (registration confirmation, password reset), newest first, each with a `link`. |
| `DELETE /test/mailbox/{email}` | Empties that mailbox. |
| `GET /test/logs?correlationId=` | The redacted log lines for one request. Keeps the last 5,000 lines; `POST /test/reset` clears them. |
| `GET /test/clock` | Returns `{ now, offsetMs }`. |
| `POST /test/clock` | Moves the server's "now". Body `{ "now": "<ISO date>" }`, `{ "offsetMs": n }` or `{ "advanceMs": n }`; an empty body resets it. Drives JWT expiry, lockout, reset-link expiry, discount windows and order dates. |
| `POST /test/latency` | Delays matching requests. Body `{ "path": "/api/v1/products*", "method"?: "GET", "delayMs": 3000 }`. `GET` lists the rules, `DELETE` clears them. |
| `GET /test/bugs` | Every named defect, whether it is on, and the AC it breaks. See [Bug mode](#bug-mode). |
| `POST /test/bugs` | Switches defects on or off: `{ "enable": ["order-leak"], "disable": [...] }`. `DELETE /test/bugs` turns them all off. |
| `POST /test/chaos` | Makes matching requests fail. Body `{ "path", "method"?, "status"?: 500, ... }` plus exactly one of `failureRate` (0 to 1, random) or `failNext` (fail the next N, deterministic). Failures use code `CHAOS_INJECTED` and an `X-Chaos-Rule` header. `GET` lists the rules, `DELETE` clears them. |

Latency and chaos rules match the path without its query string, and `*` is the only wildcard. They apply to `/api/v1/*` and `/pay/*`, never to `/test/*` or `/health`. `POST /test/reset` clears them.

### Test sessions

Defects, the clock, latency and chaos rules, and rate-limit counters are global unless you use a test session, so one parallel worker switching on `order-leak` changes every other worker's run. A session gives each worker its own copy.

- `POST /test/sessions` returns `{ id }` and sets a `test_session` cookie.
- Send the id as the `X-Test-Session` header, or let the browser send the cookie (`context.addCookies` with `domain: 'localhost'`). That request then uses the session's state, and hook calls (`/test/bugs`, `/test/clock`, `/test/latency`, `/test/chaos`) change only the session.
- Requests with no session use the global state, exactly as before.
- Database rows are still shared: keep using `POST /test/users` for per-test data.
- The payment frame is on the API origin, so the shop adds `testSession=<id>` to the frame URL, and the frame sends it on its own calls.
- A session unused for an hour (`TEST_SESSION_IDLE_MS`) is forgotten. Hook calls naming it then return 404 `TEST_SESSION_NOT_FOUND`, and other requests fall back to the global state. `POST /test/reset` ends every session.

### Fixtures for `POST /test/seed`

| Fixture | Creates |
| --- | --- |
| `customer-with-orders` | A new customer with 3 orders (20, 5 and 1 days ago). Returns `user.email` and `user.password`. |
| `orders-for-admin` | 2 customers (Nora Grid, Liam Grid) with 12 orders: 3 paid, 3 processing, 3 shipped, 2 delivered and 1 cancelled. Two use `SAVE10`. |
| `customer-with-wishlist` | A customer with 4 wishlist items in a known order |
| `customer-with-avatar` | A customer who already has an avatar |
| `product-with-reviews` | 3 reviews (ratings 5, 4, 2; average 3.7) on product 1, Wireless Earbuds. One review contains `<script>alert('xss')</script>`. |
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

`POST /test/reset` also switches every bug-mode defect off.

## API conventions

- **Errors** always have the shape `{ "error": { "code", "message", "details", "correlationId" } }`. Validation failures return 422, with `details` as an array of `{ field, message }`.
- **Correlation IDs**: every response has an `X-Correlation-Id` header. Send your own (1 to 64 of `A-Z a-z 0-9 - _`) and it is echoed back; otherwise, or if it is invalid, the API generates a UUID. Errors repeat it as `error.correlationId`.
- **Metrics**: `GET /metrics` serves Prometheus text: a request-duration histogram by method, route and status, orders created, payments declined, active defects, database pool usage and the Node.js process metrics. It is outside `/api/v1`, so it is never rate limited.
- **Logs**: the API writes one JSON line per request to stdout (`docker compose logs api`) with the correlation ID, route, status, duration, user and active defects. Passwords, tokens, the `Authorization` header, cookies and card details are redacted. `LOG_LEVEL=silent` turns stdout logging off.
- **Authentication**: send `Authorization: Bearer <accessToken>`, or rely on the httpOnly `session` cookie that `/auth/login` sets.
  - Access tokens last 15 minutes.
  - Refresh tokens last 7 days and are single use. Send one in the body of `POST /auth/refresh` or via the `refresh_token` cookie.
  - After 5 failed logins the account is locked for 15 minutes; login then returns 423 with `Retry-After`.
  - Deleting an account ends every session at once: its access tokens return 401 `TOKEN_REVOKED` and its refresh tokens stop working.
- **User administration** (PLS-23): `GET /admin/users` (filters `role` and `q`, paged with `page` and `limit`) for admin and support; `PATCH /admin/users/{id}` with `role` and/or `unlock: true` for admin only. A new role applies from the user's next login. API only, no admin page yet.
- **Your account** (PLS-22): `GET /users/me`; `PATCH /users/me` with `name`, or `email` plus `currentPassword` (other fields are ignored); `DELETE /users/me` anonymises the account (its orders stay, as "Deleted user") and removes the avatar, cart, wishlist and emails. There is no account page for these yet; they are API only.
- **Guest carts** live in an httpOnly `cart_id` cookie. On login they merge into the account cart. If a product is in both carts it keeps the larger quantity, so quantities are never doubled.
- **Rate limit**: 100 requests a minute per user (or per IP for guests) on `/api/v1/*`, except `/health`. Over the limit returns 429 with `Retry-After`. Configure it with `RATE_LIMIT_PER_MIN`. A guest's IP is taken from `X-Forwarded-For` only when the web proxy sends it (`TRUSTED_PROXIES`), so rotating that header from a test doesn't reset the limit; use a [test session](#test-sessions) or `POST /test/reset` instead.
- **Pagination**: `GET /products` returns `meta: { page, limit, total, totalPages }` plus `Link` (`first`/`prev`/`next`/`last`) and `X-Total-Count` headers.
  - Default page size is 12, maximum 48.
  - Sorts always end with a tie-breaker on `id`.
- **Conditional reads**: `GET /products/{id}` sends an `ETag` and returns 304 on a matching `If-None-Match`.
- **Optimistic locking** (PLS-21): `PUT` and `PATCH /products/{id}` and `PATCH /orders/{id}/status` need `If-Match` with the `ETag` from the matching `GET` (orders also carry it as `etag`, including in the list). A stale one returns 412 `PRECONDITION_FAILED`; a missing one returns 428 `PRECONDITION_REQUIRED`. `If-Match: *` matches any version. Bulk status changes and customer cancellation don't need it.
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
- **Config**: `GET /api/v1/config` returns `{ paymentFrameUrl, testHooks, currencies, bugs }` for the web app. `currencies` holds the display rates (`{ EUR: 1, GBP: 0.85 }`) and `bugs` lists the active bug-mode defects.
- **Live order status (WebSocket)** at `/ws/orders`:
  - Authenticate with the `session` cookie or `?token=<accessToken>`; without either the upgrade gets 401.
  - On connect you get `{ "type": "hello", "userId", "role" }`.
  - After that, every status change (inline or bulk) sends `{ "type": "order.status", "orderId", "number", "status", "from", "at" }` to the order's owner and to every admin and support socket.
  - Send `{ "type": "ping" }` to get a `pong`. The server pings every 30 s.
- **Live stock (SSE)**: `GET /api/v1/stock/stream?ids=1,2` (omit `ids` to watch everything).
  - First an `event: snapshot` with `{ products: [{ productId, stock }] }`.
  - Then an `event: stock` with `{ productId, stock }` after every order and every admin stock change.
  - A `: ping` comment arrives every 15 s, and a new snapshot follows `/test/reset`.
- **Reviews**: `GET /products/{id}/reviews` returns `{ data, meta: { count, average } }`, newest first.
  - `POST` the same path with `{ rating 1-5, title, body? }`. You must be logged in; it's one review per user per product (409 for a second), and invalid input gets 422.
  - Text is stored exactly as written.
- **Cart discounts**: the cart has `discount` (the applied code) and `discounts` (a list). The list only ever holds more than one code with the `discount-stacking` defect.
- **Stores**: there's a fixed list of 12 stores (11 in Ireland, plus Belfast).
  - `GET /stores?q=` searches by town or name.
  - `GET /stores/nearest?lat=&lng=&limit=3` sorts by straight-line (haversine) distance and adds `distanceKm`. Missing or out-of-range coordinates get 422.
- **Offers**: `GET /offers` returns the public, active discount codes (`SAVE10`, `FIXED20`) shown in the "Current offers" strip.
- **Product images**: each product has `images` (3 URLs: the main image, a side view and a detail view) for the gallery.

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
| `/new-arrivals` | Newest products, 12 at a time. More load when `infinite-sentinel` scrolls into view; `load-more-button` is the fallback, and `new-arrivals-end` appears after all 40. |
| `/products/:id` (Phase 3) | Adds a live stock counter (SSE) and reviews, rated with the `<review-stars>` web component |
| `/products/:id` (Phase 4) | The image is now a gallery: swipe or tap the image, or use ‹ › and the dots (arrow keys work when it's focused) |
| `/stores` | Store finder: "Find stores near me" uses geolocation and lists the 3 nearest. If location is denied or unavailable, it shows a message and offers a town search. |
| `/`, `/cart` | A "Current offers" strip with "Copy code" buttons |
| `/account`, `/account/orders/:id` | A "Notify me about my orders" toggle. Once on, live status changes show a browser notification. Order pages also have "Copy order number". |
| Every page | A "Low battery: animations paused" banner when the Battery Status API reports under 20% and not charging |

## Playwright notes

- **Payment iframe**: the card form is cross-origin. Use `page.frameLocator('[data-testid="payment-frame"]')`, then `getByTestId('frame-card-number')` and so on, and click `frame-pay-button`. The parent page shows `payment-declined`, `payment-timeout` (with `payment-retry-button`, which resubmits the frame) and `payment-error` (with `payment-order-retry-button` when placing the order failed after payment).
- **Native dialogs**: product delete and wishlist remove use `confirm()`. Leaving checkout for another page in the app also uses `confirm()` ("Your order is not finished. Leave checkout?"). Handle them with `page.on('dialog')`; Playwright dismisses unhandled dialogs.
- **beforeunload**: checkout pages register a `beforeunload` handler while the cart has items. Test it with `page.close({ runBeforeUnload: true })` and a `dialog` listener. Accept the dialog in tests that reload or leave mid-checkout.
- **New tab and popup**: "Track parcel" is a `target="_blank"` link, so use `context.waitForEvent('page')`. "Print receipt" calls `window.open`, so use `page.waitForEvent('popup')`.
- **Download**: "Export CSV" is a plain `<a download>`, so use `page.waitForEvent('download')`.
- **Upload**: `setInputFiles` on `avatar-input`, then click `avatar-upload-button`.
- **Hover menu**: the account menu (`account-menu-button`) opens on hover, click, Enter or ArrowDown. **Log out (`logout-button`) is inside this menu**, so open it first.
- **Tooltips**: `vat-info-button` in the totals, and every disabled control a support user sees. Hover or focus the control, and the `role="tooltip"` element appears.
- **Mobile**: under 768 px the nav collapses behind `nav-menu-button` (`aria-expanded`, `aria-controls="main-menu"`). Escape or navigating closes it.
- **WebSocket**:
  - Order detail, confirmation, account history, the admin grid and the track page update live. Each shows a `live-indicator` with `data-state` (`connecting`, `open`, `closed`); wait for `open` before changing a status.
  - `page.routeWebSocket('**/ws/orders', ...)` lets you fake `order.status` messages.
- **SSE**: the product page's `product-stock` (`data-stock`) follows the stream. `stock-live-indicator` shows `data-state="open"` once connected. The stream is a normal HTTP request, so it can be routed or aborted.
- **Shadow DOM**: `<review-stars>` has an open shadow root, and Playwright's CSS and role locators pierce it.
  - Use `page.getByTestId('review-rating').getByTestId('star-4')` or `getByRole('radio', { name: '4 stars' })`.
  - Read-only stars expose `getByRole('img', { name: '2 out of 5 stars' })`.
  - Arrow keys, Home and End change the rating. A `change` event (bubbling, composed) carries `detail.value`.
- **Infinite scroll**: scroll `infinite-sentinel` into view, or call `mouse.wheel`, until `new-arrivals-end` appears. Use `toHaveCount` on `product-card`.
- **Locale, timezone and colour scheme**:
  - With no saved choice, the language comes from the browser (`locale: 'ga-IE'` gives Irish), the currency from `en-GB` (GBP, otherwise EUR), and the theme from `colorScheme`.
  - The `language-select`, `currency-select` and `theme-toggle` choices are saved in localStorage.
  - Dates use the browser's `timezoneId`. Order times come from the server clock, so use `POST /test/clock` to place a late-evening order.
- **Offline**: `context.setOffline(true)` shows `offline-banner` (`data-state="offline"`). Going back online shows "Back online", and the products, product, cart and admin orders pages reload their data.
- **Accessibility**: home, product, cart and checkout have no serious or critical axe violations (checked in English, Irish and dark mode). Three faults are **planted on purpose** elsewhere, for practising `@axe-core/playwright`:
  1. `/new-arrivals`: the promo banner image has no `alt` (`image-alt`, critical).
  2. `/wishlist`: the helper text above the list fails colour contrast (`color-contrast`, serious).
  3. `/track/:id`: the envelope "share" link has no accessible name (`link-name`, serious).
- **Visual testing**: the home and product pages are stable after `/test/reset`. Mask `live-indicator`, `stock-live-indicator`, `toast-region` and any dates. Use `colorScheme: 'light'` (or set the theme) for consistent baselines.

### Phase 4: browser APIs

- **Geolocation** (`/stores`): use `context.grantPermissions(['geolocation'])` with `geolocation: { latitude: 53.2707, longitude: -9.0568 }` (Galway), then click `store-locate-button`; three `store-result` items appear, Galway first. Leaving permission ungranted (or denying it) shows `store-finder-denied`, and `store-search-input` searches by town. `store-finder-loading` is the spinner.
- **Notifications**: grant `notifications`, or replace `window.Notification` with a counting fake via `page.addInitScript` (headless browsers don't show real notifications). Click `notifications-toggle` (calls `Notification.requestPermission()`; `notifications-status` has `data-status` on, off, blocked or unsupported), then change the order's status with the API. Each change creates one notification, titled "Order PL-000123 is now shipped", with a `tag` so repeats collapse.
- **Clipboard**: `context.grantPermissions(['clipboard-read', 'clipboard-write'])`. Click `copy-code-SAVE10` or `copy-order-number-button`, then read the clipboard back with `page.evaluate(() => navigator.clipboard.readText())`. A "Copied …" toast confirms it. If the clipboard is denied or missing (PLS-15.3), the button is followed by `<button test id>-fallback`, a read-only input with the text selected, and `<button test id>-fallback-hint`, "Press Ctrl+C to copy".
- **Battery** (Chromium only): mock it before the page loads. The banner (`battery-banner`) and `<html data-battery-saver="on">` follow `levelchange` and `chargingchange` events, and the battery saver stops the CSS animations (`.pulse`, `.offer-code` and spinners). Use `page.exposeFunction` if you'd rather drive the mock from the test.
  ```ts
  await page.addInitScript(() => {
    const battery = Object.assign(new EventTarget(), { level: 0.1, charging: false });
    (window as any).__battery = battery;
    (navigator as any).getBattery = () => Promise.resolve(battery);
  });
  // later: await page.evaluate(() => { __battery.charging = true; __battery.dispatchEvent(new Event('chargingchange')); });
  ```
- **Service worker** (production build only, which is what Docker serves): it caches the app shell and the catalogue (`/api/v1/products*`, `/api/v1/categories`, `/img/*`). The footer shows `offline-ready` once it controls the page.
  - When offline, `/products` still loads from the cache with `offline-catalogue-notice`, and cached responses carry `X-SW-Cache: hit`.
  - Requests the worker handles **are not seen by `page.route`**, so use `serviceWorkers: 'block'` in every project that isn't testing the worker.
  - To test it, let it install (load a page, reload), then `context.setOffline(true)` and reload.
  - While the browser is offline, the cart's `checkout-button` is a disabled button and `checkout-offline-message` explains why (PLS-17.2). It turns back into the checkout link on the `online` event.
- **Touch** (gallery): with `hasTouch: true` (any mobile device profile), `locator.tap()` on `gallery-stage` advances. A swipe is a horizontal pointer drag of more than 40 px; dispatch `touchstart`, `touchmove` and `touchend`, or use the mouse with `page.mouse` on desktop. `gallery-status` reads "Image 2 of 3", and the dots have `aria-current`.
- **Aria snapshots**: the product card, the order summary and the header (`site-header`) have stable accessible structure. Generate a starting point with `await locator.ariaSnapshot()` and replace the values that change with regexes. For example, a product card looks roughly like this:
  ```yaml
  - article "Wireless Earbuds":
    - heading "Wireless Earbuds" [level=3]:
      - link "Wireless Earbuds"
    - paragraph: Electronics
    - paragraph: /€\d+\.\d{2}/
    - paragraph: In stock
    - button "Add Wireless Earbuds to cart"
    - button "Add Wireless Earbuds to wishlist"
  ```
  The order summary is a region named "Order summary": an h2, then h3 headings for Items, Totals and Delivery address.
- **Component tests**: the harness lives in `web/` (`@playwright/experimental-ct-react` 1.62.1, `playwright-ct.config.ts`, `playwright/index.tsx`).
  - Write `*.ct.tsx` files under `web/src` and run `cd web && npm run test-ct` (install browsers with `npx playwright install chromium` first).
  - Every mount is wrapped by `src/testing/ComponentHarness.tsx`. Pass `hooksConfig: { lang: 'ga', currency: 'GBP', theme: 'dark', bugs: ['quantity-negative'], route: '/cart' }` as needed. Add `app: true` to also mount auth, cart and wishlist, and mock `/api/v1/**` with `page.route`.
  - Good first candidates: `Totals`, `QuantityStepper`, `ReviewStars`, `Pagination`, `ProductGallery` and `CopyButton`.
  - Keep `@playwright/test` in your suite on the same version as the CT package.
- **Extension**: see [`extensions/price-tracker/README.md`](extensions/price-tracker/README.md). Load it with `chromium.launchPersistentContext` plus `--load-extension`, using Playwright's bundled Chromium (branded Chrome ignores the flag). On product pages it adds `price-tracker-badge`.

## Bug mode

Switch defects on with `POST /test/bugs` (needs `TEST_HOOKS=true`):

```bash
curl -X POST localhost:3000/test/bugs -H 'Content-Type: application/json' -d '{"enable":["order-leak"]}'
curl localhost:3000/test/bugs        # list with enabled flags
curl -X DELETE localhost:3000/test/bugs   # all off (so does /test/reset)
```

**Web** and **payment frame** defects take effect on the next page load (or `page.reload()`), because the page reads the active list from `GET /api/v1/config` when it loads.

| Defect | AC it breaks | Where | Behaviour when on |
| --- | --- | --- | --- |
| `discount-not-applied` | PLS-5.1, PLS-5.10, PLS-5.11 | API | The code shows as applied, but the totals ignore it |
| `expired-discount-accepted` | PLS-5.2 | API | Expired codes are accepted |
| `discount-stacking` | PLS-5.4 | API | A second code is accepted and both apply (the cart's `discounts` lists both) |
| `discount-survives-cart-change` | PLS-5.5 | API | The minimum spend is not re-checked when the cart changes |
| `discount-negative-total` | PLS-5.6 | API | Fixed codes are not capped, so the total goes negative |
| `single-use-reused` | PLS-5.3, 24.9 | API | A used single-use code still works |
| `discount-case-sensitive` | PLS-5.7 | API | `save10` is rejected; only `SAVE10` works |
| `vat-before-discount` | PLS-5.8 | API | VAT is charged on the pre-discount subtotal |
| `cart-total-rounding` | PLS-4.4 | API | The subtotal is 1 cent more than the sum of lines with 3 or more items |
| `currency-switch-stale` | PLS-4.6 | Web | The cart page keeps € prices after switching to GBP |
| `price-tamper` | PLS-6.7 | API | `POST /orders` uses `items[].unitPriceCents` sent by the client |
| `quantity-negative` | PLS-4.2 | API + web | A quantity of 0 or below is accepted and saved |
| `stock-oversell` | PLS-4.3, 21.4 | API | No stock checks in the cart or orders (stock bottoms out at 0) |
| `double-submit` | PLS-6.4 | API + web | No locking or payment-reuse check; the payment page places the order twice |
| `order-leak` | PLS-7.2, 24.1 | API | Any customer can read any order (and its tracking) by id |
| `logout-incomplete` | PLS-1.4 | API + web | Logout leaves the session alive, so Back shows the account page |
| `token-never-expires` | PLS-1.5, 24.2 | API | Expired access tokens are accepted |
| `search-apostrophe` | PLS-3.2 | API | A search containing `'` returns 500 |
| `pagination-duplicate` | PLS-3.5 | API | Page 2 onwards starts with the previous page's last item |
| `fada-rejected` | PLS-2.3 | API | Names with accents (Seán, Ní Bhriain) get 422 |
| `timezone-off-by-one` | PLS-7.3 | Web | Dates are shown in UTC, so a 22:30 New York order shows the next day |
| `upload-extension-only` | PLS-9.3 | API | The avatar type is taken from the file name, so a renamed `.exe` is accepted |
| `button-moves` | PLS-6.8 | Payment frame | A banner pushes the Pay button down 500 ms after the frame loads |
| `missing-label` | PLS-2.6, 11.1 | Web | The login and register email fields lose their label |
| `stale-stock` | PLS-8.6 | API | The SSE stream stops sending stock updates |
| `rate-limit-bypass` | PLS-24.6 | API | `X-Forwarded-For` is believed from anyone, so a guest can rotate it to dodge the rate limit |
| `lost-update` | PLS-21.2, 21.3, 21.5, 21.7 | API | `If-Match` is ignored, so a stale or missing one still overwrites the latest version |
| `status-any-transition` | PLS-20.2, 20.3, 20.4 | API | An admin can set any status, singly or in bulk, such as delivered back to pending |
| `wrong-status-code` | PLS-2.4, 10.2 | API | Validation errors return 500 instead of 422 |
| `missing-security-headers` | PLS-24.11 | API | API responses carry none of `X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy` and `Permissions-Policy` (the web app's headers are fixed) |
| `verbose-errors` | PLS-24.12 | API | An unexpected 500 includes the stack trace, the SQL and file paths in `error.details` (reach one with `search-apostrophe`) |
| `geolocation-ignored` | PLS-13.1 | API | `/stores/nearest` ignores the position and always returns Dublin stores |
| `permission-denied-crash` | PLS-13.2 | Web | Denied location leaves `store-finder-loading` spinning forever, with no message |
| `clipboard-wrong-value` | PLS-15.1 | Web | Each "Copy code" button copies the previous code in the list (`SAVE10` copies `FIXED20`) |
| `notification-spam` | PLS-14.2 | Web | One status change fires two notifications, with no `tag` |
| `battery-banner-stuck` | PLS-16.2 | Web | `chargingchange` is ignored, so the banner stays after charging starts |
| `offline-stale-prices` | PLS-17.3 | Service worker | The catalogue is served cache-first even when online, so prices go stale (the worker re-registers as `sw.js?bugs=offline-stale-prices`) |
| `aria-heading-skip` | PLS-19.2 | Web | The order summary's sub-headings are h4 directly under its h2 (axe: `heading-order`) |

There are 38 defects. Each one changes only its own behaviour (PLS-12.3). There are two unavoidable overlaps:
- `discount-not-applied` also breaks PLS-5.6, because a fixed code that is not applied cannot bring the total to €0.
- `vat-before-discount` also breaks PLS-5.6, because VAT on the pre-discount price leaves a non-zero total.

## Locators: `data-testid` conventions

- Every link, button, input, select and textarea has a kebab-case `data-testid`.
- The markup is semantic (`header`, `nav`, `main`, `form`, `table`, labelled inputs, `role="alert"` and `role="status"` messages), so `getByRole` and `getByLabel` work as well.
- Repeated items carry an id attribute, such as `data-product-id` or `data-order-id`.
- Money values carry `data-cents` or `data-price-cents`, so you can make numeric assertions without parsing text.
- A field's error message uses the field's test id plus `-error`, for example `register-email` → `register-email-error`.

| Area | Test ids |
| --- | --- |
| Header | `nav-home`, `nav-products`, `nav-new-arrivals`, `nav-wishlist`, `nav-account`, `nav-admin`, `nav-cart`, `cart-count`, `nav-menu-button`, `main-menu`, `nav-cart-compact`, `cart-count-compact`, `nav-login`, `nav-register`, `header-search-input`, `header-search-button` |
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
| Preferences | `prefs-controls`, `language-select`, `currency-select`, `theme-toggle` (`aria-pressed`) |
| Live | `live-indicator` (`data-state`), `stock-live-indicator` (`data-state`), `product-stock-count`, `offline-banner` (`data-state`) |
| Reviews | `reviews`, `reviews-summary` (`data-count`, `data-average`), `review-list`, `review` (`data-review-id`, `data-rating`), `review-title`, `review-body`, `review-author`, `review-stars`, `review-form`, `review-rating` (the `<review-stars>` input), `review-rating-error`, `review-title-input`, `review-body-input`, `review-body-counter`, `review-submit`, `review-submitted`, `review-login-link`. Inside each `<review-stars>` shadow root: `stars-display`, `stars-input`, `star-1`…`star-5`, `stars-value`. |
| New arrivals | `new-arrivals-count` (`data-count`), `new-arrivals-grid`, `infinite-sentinel`, `load-more-button`, `new-arrivals-loading`, `new-arrivals-end`, `new-arrivals-error`, `new-arrivals-banner` |
| Payment frame (bug mode) | `frame-late-banner` (appears with `button-moves`) |
| Store finder | `store-locate-button`, `store-finder-loading`, `store-finder-denied`, `store-finder-unavailable`, `store-finder-position`, `nearest-stores`, `store-result` (`data-store-id`), `store-name`, `store-distance` (`data-km`), `store-search-input`, `store-search-button`, `store-search-results`, `store-search-empty`, `store-finder-error`, `nav-stores` |
| Offers and copy | `offers-strip`, `offer` (`data-code`), `offer-code`, `copy-code-SAVE10`, `copy-code-FIXED20`, `copy-order-number-button` (`data-copied`) |
| Notifications | `notifications`, `notifications-toggle` (`aria-pressed`), `notifications-status` (`data-status`) |
| Battery and offline | `battery-banner` (`data-level`), `offline-ready`, `offline-catalogue-notice` |
| Gallery | `product-gallery` (`data-index`), `gallery-stage`, `gallery-image` (`data-index`), `gallery-prev`, `gallery-next`, `gallery-dot-1`…`gallery-dot-3` (`aria-current`), `gallery-status` |
| Regions | `site-header`, `order-summary` (a region labelled "Order summary") |
| Auth | `login-email`, `login-password`, `login-submit`, `login-error`, `register-name`, `register-name-counter`, `register-email`, `register-password`, `register-submit`, `register-success`, `forgot-password-email`, `forgot-password-submit`, `reset-password-input`, `reset-password-confirm`, `reset-password-submit`, `email-unverified-banner` |
| Mailbox | `mailbox-email-input`, `mailbox-open-button`, `mailbox-message` (`data-type`), `mailbox-subject`, `mailbox-body`, `mailbox-link` |
| Toasts | `toast-region`, `toast` (`data-type`), `toast-message`, `toast-dismiss` |

## Platform tests

These check the app itself. They are not the training suites, which live in [`../tests/`](../tests/).

- **API unit tests**, in [`api/test/`](api/test/): `cd api && npm test`. They need no database.
- **API integration tests**, in [`api/test/integration/`](api/test/integration/): `cd api && npm run test:int`, with the
  `db` container running. They create their own `playlab_test` database on each run (on `DB_PORT`, or
  `TEST_DATABASE_URL`), so the stack's data is never touched. `environment.int.test.ts` covers PLS-12.1–12.3:
  reset timing and seed restoration, disabled test-hook routes, and the isolation of an enabled defect. PLS-12.4's
  live readiness check is in `e2e/specs/health.spec.ts`.
- **Smoke tests in a browser**, in [`e2e/`](e2e/): `cd e2e && npm ci && npx playwright install chromium && npm test`, with
  the stack running. The suite reads `API_PORT` and `WEB_PORT` from `app/.env` (or the environment), resets the stack
  before each test, and names each test after the AC it checks. CI runs it on a stack configured from `.env.example`
  with non-default ports.
- **Gate 1 screenshots**: `cd e2e && npm run test:gate1` compares 14 pages with baselines taken before Phase 1. The
  baselines are macOS-specific, so CI doesn't run them.
- **API probe**: [`../tools/api-probe/probe.sh`](../tools/api-probe/probe.sh) prints 46 normalised responses. Diff its
  output with `baseline-phase0.txt` to see exactly which responses a change moved. It resets the stack.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `TEST_HOOKS` | `true` | Mount `/test/*` |
| `RATE_LIMIT_PER_MIN` | `100` | API rate limit |
| `PAYMENT_TIMEOUT_MS` | `5000` | Delay before the timeout card returns 504 |
| `JWT_SECRET` | dev value | Access-token signing key |
| `NODE_ENV` | `development` in Compose (`production` in the image) | With `production`, the API refuses to start while `TEST_HOOKS=true` |
| `PLAYLAB_ALLOW_UNSAFE` | `false` | `true` lets the API start with test hooks on in production, with a warning |
| `TRUSTED_PROXIES` | the `WEB_URL` host | Comma-separated hosts whose `X-Forwarded-For` is believed |
| `TEST_SESSION_IDLE_MS` | `3600000` | How long an unused test session lasts |
| `LOG_LEVEL` | `info` | Request logs on stdout: `info`, `warn`, `error` or `silent` (`GET /test/logs` keeps them either way) |
| `WEB_PORT` / `API_PORT` / `DB_PORT` | `5173` / `3000` / `5432` | Host ports |
| `PUBLIC_WEB_URL` | `http://localhost:${WEB_PORT}` | Base URL used in links inside mailbox emails |
| `PAYMENT_FRAME_URL` | `http://localhost:${API_PORT}/pay/frame` | Where the browser loads the payment iframe from |
| `SHOP_ORIGINS` | `http://localhost:${WEB_PORT}` | Comma-separated origins allowed to embed the frame (`frame-ancestors`) and receive its `postMessage` results |

## Scope

Build phases 1–4 in the spec are done. Phases 5 (framework maturity) and 6 (Playwright Test Agents) are yours.

- **Phase 1:** auth, catalogue, cart, discounts, checkout, the core API and the test hooks.
- **Phase 2:** roles, admin grid, iframe payments, files, dialogs, windows, drag-and-drop, the mobile menu, and latency/chaos.
- **Phase 3:** WebSocket and SSE, shadow DOM, infinite scroll, i18n, currency and timezone, planted a11y faults, bug mode, theme toggle and offline.
- **Phase 4:** store finder (geolocation), order notifications, copy buttons, the battery-saver banner, the service-worker offline cache, the swipeable gallery, stable regions for aria snapshots, the component-test harness, the price-tracker extension and 7 more defects.

Every AC in PLS-1 to PLS-19 of `docs/ACCEPTANCE_CRITERIA.md` has an implementation to test against. PLS-20 to PLS-29 specify the upgrade plan's platform work and are mostly not built yet; each story says which phase builds it.

One edge-case scenario from the spec's checklist, which isn't in any phase, is **not built**: the UI backing off after a 429. (Account deletion that logs out other sessions arrived with PLS-22 in Phase 1.)

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
18. Order status changes follow transition rules (PLS-20): `pending → paid → processing → shipped → delivered`, and cancellation from `pending`, `paid` or `processing`, which restocks. Anything else is 409 `INVALID_TRANSITION`; bulk changes are all or nothing. Customers can cancel their own order while it is `pending` or `paid` (`POST /orders/{id}/cancel`).
19. **GBP is display-only.** The API is EUR throughout, and the web converts each amount on its own at a fixed 0.85. In GBP the converted lines can therefore differ from the converted subtotal by a penny, so test PLS-4.4 in EUR.
20. The Irish translations cover navigation, the cart and checkout (PLS-11.5). They are best-effort, not a professional translation, and other pages stay in English.
21. Language, currency and theme default to the browser's `locale` and `colorScheme`, and a choice made in the header overrides them. Switching language or currency re-renders the page.
22. The accessibility AC (PLS-11.1) holds on home, product, cart and checkout. The spec's "few planted a11y faults" are on `/new-arrivals`, `/wishlist` and `/track/:id`.
23. Bug mode: `discount-not-applied` and `vat-before-discount` also break PLS-5.6 (see [Bug mode](#bug-mode)). `double-submit` adds a 300 ms pause when placing an order, so concurrent requests overlap reliably. `search-apostrophe` simulates a SQL error rather than actually building unsafe SQL.
24. The product page shows `product-stock-count` ("N available") next to `product-stock`. The text of `product-stock` is unchanged, so exact-text locators still work.
25. Reviews (PLS-11.2) are new in Phase 3: one per user per product, with no editing or deleting.
26. The Phase 4 features are specified by PLS-13 to PLS-19, which were reconciled with the build in Phase 0: the ACs now use the build's messages, results appear after "Find stores near me" is selected, and a tap on the gallery advances. The Phase 4 defects map to those IDs like every other defect.
27. The service worker is registered only by the production build (`vite preview`, which Docker runs), not the dev server. It handles requests before `page.route` can see them, so block service workers in tests that mock the network.
28. The Battery Status API exists only in Chromium, so the battery banner never appears in Firefox or WebKit unless you mock `navigator.getBattery`.
29. "Copy discount code" lives in a "Current offers" strip on the home and cart pages (new `GET /offers`, plus a `public` flag on discount codes). The strip changes those pages' visual baselines.
30. The order summary is now a labelled region with an h2 "Order summary" and h3 sub-headings, for stable aria snapshots. Its test ids are unchanged.
31. The component harness ships with no component tests; they're part of your Phase 5. The CT package is pinned to 1.62.1.
32. The price-tracker extension has a small background service worker so tests can find its ID. It runs only in Chromium.
