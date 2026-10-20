# Playwright Practice Site — Spec & Build Plan

20 Oct 2026 · Craig

## Purpose

Build **PlayLab Shop**: a small, realistic e-commerce site that runs locally in Docker and exposes every pattern a Playwright suite meets on a real project. The app exists to be tested; the test suite is the real deliverable.

Goals:

- Practise the full Playwright toolkit: UI, API, network mocking, auth, visual and accessibility checks.
- Start from a clean, known state on every run with one command.
- Inject known defects on demand, to prove the tests catch them.
- End with a public GitHub portfolio piece: app, test framework, CI pipeline and HTML reports.

Out of scope: real payments, real email, production hosting, performance at scale.

## Architecture

Three containers started by one `docker compose up`, with the Playwright suite running outside them, exactly as it would against a real staging environment.

```
                +---------------------------------------------------+
                | Playwright suite (your machine or CI)             |
                | UI tests drive a browser; API tests use request   |
                +---------------------------------------------------+
               | browser                     | API calls and /test hooks
               v                             v
+---- docker compose up ------------------------------------------------------------------+
|  +----------------------+     +-------------------------+     +----------------------+  |
|  | web: React           | --> | api: Express            | --> | db: Postgres 16      |  |
|  | localhost:5173       |     | localhost:3000/api/v1   |     | Seed data on start   |  |
|  | Shop and admin UI    |     | /test/* hooks, bug mode |     | Wiped by /test/reset |  |
|  | data-testid on all   |     | WebSocket and SSE       |     | Removed on down -v   |  |
|  +----------------------+     +-------------------------+     +----------------------+  |
+-----------------------------------------------------------------------------------------+
```

The API is the centre of gravity: the web app only talks to it, and the tests can reach it directly for setup, resets and API checks.

| Layer | Choice | Why |
| --- | --- | --- |
| Front end | React + Vite + TypeScript | Common in real teams; produces realistic dynamic DOM |
| API | Node 20 + Express + TypeScript (or FastAPI) | Same language as your Playwright tests |
| Database | Postgres 16 | Realistic; easy to wipe and reseed |
| Docs | OpenAPI 3 + Swagger UI | Lets you practise contract and schema checks |
| CI | GitHub Actions | Runs Compose, then the suite, then publishes the report |

## Feature checklist

Each feature is there because it exercises a specific Playwright skill. Phase = when it gets built (see Build phases).

| Area | Feature on the site | Playwright skill it exercises | Phase |
| --- | --- | --- | --- |
| Auth | Login/logout with session cookie; registration; forgotten password with a reset link shown on a fake mailbox page | `storageState`, auth setup project, cookie assertions | 1 |
| Auth | JWT bearer tokens for the API; token expiry after 15 minutes | `request` context with headers, expired-token tests | 1 |
| Roles | Customer, admin and read-only support roles; admin-only pages | Per-role fixtures, 403 checks, parallel users | 2 |
| Catalogue | Product list with search, filters, sort and pagination | Locators (`getByRole`, `getByTestId`), list assertions | 1 |
| Catalogue | Infinite-scroll "new arrivals" page | Scrolling, `toHaveCount`, lazy loading | 3 |
| Cart & checkout | Add/remove items, quantity stepper, discount codes, 3-step checkout wizard | Multi-step E2E flows, page objects | 1 |
| Payments | Fake payment form in an **iframe**, with test card numbers that succeed, decline or time out | `frameLocator`, error states | 2 |
| Forms | Client and server validation, date picker, address autocomplete, character counters | Form filling, validation messages | 1 |
| Files | Avatar upload with type/size limits; CSV order export download | `setInputFiles`, `waitForEvent('download')` | 2 |
| Dynamic UI | Modals, toasts, tooltips, drag-and-drop wishlist ordering, hover menus | Auto-waiting, `dragTo`, `hover` | 2 |
| Web components | A review-stars widget built with **shadow DOM** | Piercing shadow roots | 3 |
| Windows | "Track parcel" opens a new tab; a print-receipt popup | `context.waitForEvent('page')`, popups | 2 |
| Dialogs | Native `confirm()` on delete; `beforeunload` on leaving checkout | `page.on('dialog')` | 2 |
| Real-time | Live order-status updates over **WebSocket**; stock counter over SSE | `page.routeWebSocket`, polling assertions | 3 |
| Network | Every UI call goes through the REST API, so any of it can be mocked or failed | `page.route`, HAR record/replay | 1 |
| Admin | Data grid of orders with inline edit, bulk actions, status changes | Table locators, row filtering | 2 |
| i18n & time | English/Irish language toggle; prices in EUR/GBP; order times in the user's timezone | `locale`, `timezoneId`, `clock` API | 3 |
| Accessibility | Mostly accessible markup, with a few planted a11y faults | `@axe-core/playwright` | 3 |
| Visual | Stable home and product pages; a theme toggle | `toHaveScreenshot`, masking dynamic regions | 3 |
| Mobile | Responsive layout with a burger menu under 768 px | Device emulation projects | 2 |

## API spec

A versioned REST API at `/api/v1`, documented with OpenAPI and browsable at `/api/docs` (Swagger UI). The UI uses only this API, so anything the UI does can also be tested directly.

| Method | Endpoint | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | none | 201 on success; 409 if the email exists; 422 on validation errors |
| POST | `/auth/login` | none | Returns a JWT and sets a session cookie; 401 on bad credentials; locks after 5 failures |
| POST | `/auth/refresh` | refresh token | New access token; 401 when expired |
| GET | `/products` | none | Query params `q`, `category`, `minPrice`, `maxPrice`, `sort`, `page`, `limit` |
| GET | `/products/{id}` | none | 404 for an unknown id |
| POST / PUT / PATCH / DELETE | `/products` and `/products/{id}` | admin | Full CRUD; 403 for customers |
| GET / POST / DELETE | `/cart` and `/cart/items/{id}` | customer | 409 when stock runs out |
| POST | `/orders` | customer | Idempotency-Key header supported; 402 on declined card |
| GET | `/orders`, `/orders/{id}` | customer / admin | Customers see only their own orders (test for leakage) |
| PATCH | `/orders/{id}/status` | admin | Pushes an event to the WebSocket channel |
| POST | `/users/me/avatar` | customer | Multipart upload; 413 over 2 MB; 415 for wrong type |
| GET | `/orders/export.csv` | admin | File download |
| GET | `/health` | none | For Docker health checks and test readiness |

Conventions to test against:

- One error shape everywhere: `{ "error": { "code", "message", "details" } }`.
- Rate limit of 100 requests a minute per user, returning 429 with `Retry-After`.
- Pagination metadata in the response body and a `Link` header.
- `ETag` on product reads, so conditional requests (304) can be tested.
- WebSocket channel at `/ws/orders` for live status; SSE stream at `/api/v1/stock/stream`.

## Testability hooks

These are what make the site feel like a well-run test environment. All live under `/test/*` and only exist when `TEST_HOOKS=true`, so you can also practise checking they are switched off.

| Hook | What it does | Why it matters |
| --- | --- | --- |
| `POST /test/reset` | Truncates every table and reloads the base seed | A clean state before each run or worker |
| `POST /test/seed` | Creates named fixtures: a user with an order history, an out-of-stock product, an expired discount code | API-seeded UI tests instead of clicking through setup |
| `POST /test/users` | Creates a throwaway user per test and returns its token | Safe parallel runs with no shared accounts |
| `GET /test/mailbox/{email}` | Shows the emails the app "sent" (registration, password reset) | Testing email flows without a real inbox |
| `POST /test/clock` | Sets the server's notion of "now" | Discount expiry and token expiry on demand |
| `POST /test/latency` | Adds a delay (for example 3 s) to chosen endpoints | Practise waiting properly, not `waitForTimeout` |
| `POST /test/chaos` | Makes a chosen endpoint fail a set percentage of the time | Retry logic, error states, flaky-test diagnosis |
| `POST /test/bugs` | Switches on named defects (see below) | Proves the suite actually catches regressions |

Named defects for bug mode, each off by default:

**Discounts and pricing**

- `discount-not-applied`: a valid code shows "Discount applied" but the checkout total is unchanged.
- `expired-discount-accepted`: an expired code is applied with no error. Correct behaviour: show "This code has expired" and leave the total alone.
- `discount-stacking`: two discount codes can be applied together.
- `discount-survives-cart-change`: removing items below the minimum spend keeps the discount.
- `discount-negative-total`: a fixed €20 code on a €15 cart gives a negative total instead of €0.
- `single-use-reused`: a one-time code works a second time.
- `discount-case-sensitive`: `SAVE10` works but `save10` is rejected.
- `vat-before-discount`: VAT is calculated on the pre-discount price.
- `cart-total-rounding`: totals are off by one cent with three or more items.
- `currency-switch-stale`: switching EUR to GBP leaves the cart in the old currency.
- `price-tamper`: the API accepts a price sent by the client instead of the stored one.

**Cart, stock and orders**

- `quantity-negative`: typing 0 or -1 in the quantity field is accepted.
- `stock-oversell`: you can order more than is in stock.
- `double-submit`: double-clicking Pay creates two orders.
- `order-leak`: a customer can read another customer's order by id.

**Auth and session**

- `logout-incomplete`: after logout, the back button still shows the account page.
- `token-never-expires`: expired JWTs are still accepted.

**Search, forms and data**

- `search-apostrophe`: searching for O'Neill returns a 500.
- `pagination-duplicate`: the last item on page 1 repeats at the top of page 2.
- `fada-rejected`: registration rejects names with accents, such as Seán or Aoife Ní Bhriain.
- `timezone-off-by-one`: order dates late in the evening show as the next day.
- `upload-extension-only`: a renamed .exe passes as a .png because only the extension is checked.

**UI and API behaviour**

- `button-moves`: the checkout button shifts position after 500 ms.
- `missing-label`: the email field loses its accessible label.
- `stale-stock`: the SSE stock counter stops updating.
- `wrong-status-code`: a validation error returns 500 instead of 422.

Every interactive element also carries a stable `data-testid`, but the markup is semantic enough that role-based locators work too, so you can practise both.

## Test scenarios to write

This is the definition of done for the site: if every scenario below can be written cleanly, the site is complete. Tick them off as your suite covers them. Acceptance criteria with IDs for traceability are in ACCEPTANCE_CRITERIA.md.

**UI end to end**

- [ ] Guest searches, filters by category and price, sorts, and pages through results
- [ ] Customer registers, confirms via the test mailbox, logs in and sees an empty order history
- [ ] Full checkout: add items, apply a discount, complete the 3-step wizard, pay in the iframe, see the confirmation
- [ ] Declined card and payment timeout each show the right error and keep the cart intact
- [ ] Leaving checkout mid-way triggers the `beforeunload` warning
- [ ] Admin edits an order's status inline and the customer's open tab updates live
- [ ] Wishlist reorders by drag-and-drop and persists after reload
- [ ] Avatar upload rejects a 5 MB file and a .exe; CSV export downloads and parses

**API**

- [ ] CRUD lifecycle for a product, with schema validation on every response
- [ ] Every error code: 400, 401, 403, 404, 409, 413, 415, 422, 429
- [ ] A customer cannot read another customer's order (and the `order-leak` bug is caught)
- [ ] Expired and tampered JWTs are rejected; refresh works
- [ ] Idempotency key prevents a duplicate order

**Hybrid and network**

- [ ] Seed a user and cart through the API, then verify checkout through the UI
- [ ] Mock `/products` to return empty, huge and malformed responses and check the UI copes
- [ ] Force a 500 on `/orders` and check the error toast and retry
- [ ] Record a HAR of the catalogue and replay it offline

**Edge cases and resilience**

- [ ] Session expires mid-checkout: user is sent to login and returns to the same step with the cart intact
- [ ] Same user in two tabs: removing an item in one tab is reflected in the other on refresh
- [ ] Guest cart merges into the account cart on login, without doubling quantities
- [ ] Product price changes between adding to cart and paying: the user is warned before payment
- [ ] Last item in stock bought by two users at once: one succeeds, the other gets a clear out-of-stock message
- [ ] Browser back button after placing an order does not resubmit it
- [ ] Refreshing on step 2 of checkout keeps entered data (or clearly restarts)
- [ ] Offline mode (`context.setOffline`) shows a friendly message and recovers when back online
- [ ] Deep link to an admin page as a customer redirects with 403, not a blank page
- [ ] Very long inputs (500-character name), emoji and right-to-left text are handled without breaking layout
- [ ] Script tags typed into a review are shown as text, not run (basic XSS check)
- [ ] Keyboard-only checkout: every step reachable with Tab and Enter
- [ ] Account deletion removes the user's data and logs out other sessions
- [ ] Rate limit: the 101st request in a minute returns 429 and the UI backs off

**Discount-specific**

- [ ] Valid code reduces the checkout total by the right amount, including VAT and delivery
- [ ] Expired code shows "This code has expired" and the total does not change
- [ ] Code that is not yet active, unknown, or already used each shows its own error message
- [ ] Minimum-spend code is removed (with a message) when the cart drops below the threshold
- [ ] Code entry is case-insensitive and trims spaces
- [ ] Discount survives a page refresh and appears on the order confirmation and CSV export

**Framework quality**

- [ ] Page objects or screen components, plus custom fixtures for each role
- [ ] Auth setup project that saves `storageState` once per role
- [ ] Runs in parallel across Chromium, Firefox, WebKit and one mobile profile
- [ ] Visual baselines with dynamic regions masked; axe scan on key pages
- [ ] GitHub Actions: start Docker, wait for `/health`, run the suite, publish the HTML report and traces
- [ ] Turn on each bug-mode defect and confirm at least one test fails for the right reason

## Build phases

Three phases, each usable on its own. Start writing tests after phase 1; don't wait for the whole site.

| Phase | Scope | Rough effort with Claude Code | Model |
| --- | --- | --- | --- |
| 0. Design | Agree this spec, the data model and the OpenAPI file | 1–2 hours | Opus |
| 1. Core | Docker Compose, Postgres, seed data, auth, catalogue, cart, checkout, the core API, `/test/reset` and `/test/seed`, health check | 8–12 hours over a weekend | Sonnet |
| 2. Realistic | Roles, admin grid, iframe payments, uploads and downloads, dialogs, new tabs, drag-and-drop, mobile layout, remaining test hooks | 6–10 hours | Sonnet |
| 3. Advanced | WebSocket and SSE, shadow DOM, infinite scroll, i18n and timezones, planted a11y faults, bug mode, theme toggle | 6–10 hours | Sonnet; Opus for tricky WebSocket or Docker networking problems |
| Ongoing | Your Playwright suite and CI pipeline | Open-ended | Write it yourself; use Claude to review |

Working tips:

- Keep the app and the tests in separate folders (or repos), as on a real team.
- Commit after every working feature, so a bad Claude Code session is easy to roll back.
- Ask for a short README per phase: how to start it, test accounts, and which hooks exist.

## Phases 4–6

Phases 1–3 are complete. These three phases cover the rest of [playwright.dev](https://playwright.dev/docs/intro): Phase 4 adds the browser-API features the site still lacks, Phase 5 matures your test framework, and Phase 6 brings in Playwright's AI test agents.

| Phase | Scope | Who builds it | Rough effort | Model |
| --- | --- | --- | --- | --- |
| 4. Browser APIs | Store finder (geolocation), order notifications, copy-to-clipboard buttons, battery-saver banner, service worker with offline cache, swipeable gallery, aria-snapshot-friendly regions, new bug-mode defects | Claude Code | 4–6 hours | `opusplan`, effort high |
| 5. Framework maturity | Sharding, tags, custom fixtures and matchers, traceability reporter, flaky-test handling, component tests | You | Ongoing | You write; Claude reviews |
| 6. Test Agents | Planner, Generator and Healer agents run against the site, compared with your own suite | You + agents | 4–8 hours | Agent setup via `npx playwright init-agents` |

**Phase 4 features**

| Feature | What it does on the site | Playwright skill it exercises |
| --- | --- | --- |
| Store finder | "Find a store near me" uses geolocation and lists the 3 nearest stores | `geolocation`, `context.grantPermissions`, denied-permission state |
| Order notifications | Asks permission, then shows a browser notification when order status changes | `grantPermissions(['notifications'])`, mocking `Notification` |
| Copy buttons | "Copy discount code" and "Copy order number", with a "Copied" toast | Clipboard permissions, reading the clipboard in a test |
| Battery-saver banner | Shows "Low battery: animations paused" when battery is under 20% and not charging | `page.addInitScript`, `exposeFunction`, mock browser APIs |
| Offline cache | A service worker caches the catalogue so it loads offline | `serviceWorkers: 'block'`, routing service-worker requests, `context.setOffline` |
| Product gallery | Swipe and tap through product images on mobile | Touch emulation, `hasTouch`, `tap()` |
| Stable regions | Product card, order summary and header with predictable accessible structure | `toMatchAriaSnapshot` |
| Component harness | The React components can run in isolation | `@playwright/experimental-ct-react` |
| Price-tracker extension (optional) | A tiny Chrome extension that reads the product price | Loading an unpacked extension in a persistent context |

New bug-mode defects for Phase 4:

- `geolocation-ignored`: the store finder always shows Dublin stores, whatever the location.
- `permission-denied-crash`: denying location permission leaves a spinner forever instead of a message.
- `clipboard-wrong-value`: "Copy discount code" copies the previous code.
- `notification-spam`: one status change fires two notifications.
- `battery-banner-stuck`: the banner stays after charging starts.
- `offline-stale-prices`: the offline cache shows old prices after going back online.
- `aria-heading-skip`: the order summary jumps from h2 to h4.

**Phase 5 checklist (your suite)**

- [ ] Shard across 4 CI workers and merge the reports with `merge-reports`
- [ ] Tag tests `@smoke`, `@regression` and by story (`@PLS-5`), and run subsets with `--grep`
- [ ] Custom fixtures per role and a custom `expect` matcher (for example `toHaveTotal('€42.00')`)
- [ ] A custom reporter that reads AC IDs from test titles and writes an AC coverage table against `ACCEPTANCE_CRITERIA.md`
- [ ] Use `/test/chaos` and `/test/latency` to create flakiness, then fix it properly; trace on first retry
- [ ] Component tests for 3–4 React components
- [ ] Video on failure and a `--last-failed` rerun habit

**Phase 6: Playwright Test Agents**

1. Run `npx playwright init-agents --loop=claude` in `tests/` (rerun after each Playwright upgrade).
2. Let the Planner explore the site and write a Markdown plan. Compare it with your ACs: what did it miss, and what did it find that you didn't?
3. Let the Generator turn part of that plan into tests in a separate folder. Review them as you would a junior's pull request.
4. Switch on bug-mode defects and run the Healer. Record whether it flags the real bug or "heals" the test to hide it.
5. Write up the results as a short README section or blog post: where agents helped, where they misled, and what guardrails you'd use on a real team.

## Prompt for Claude Code

Put this file in the repo as `SPEC.md` (and `ACCEPTANCE_CRITERIA.md` beside it), then paste:

```
Read SPEC.md and ACCEPTANCE_CRITERIA.md. They describe PlayLab Shop,
a practice e-commerce site built to be tested with Playwright.

Build Phase 1 only. Requirements:
- docker-compose.yml with three services: web (React + Vite),
  api (Node 20 + Express + TypeScript), db (Postgres 16).
- `docker compose up` starts everything; `docker compose down -v` wipes it.
- API at /api/v1 with an OpenAPI 3 file and Swagger UI at /api/docs.
- Seed script with 3 users (customer, admin, support), 40 products
  across 5 categories, and 2 discount codes.
- Test hooks under /test/* only when TEST_HOOKS=true.
- Semantic HTML plus a data-testid on every interactive element.
- The app must satisfy the ACs for the features in this phase.
- A README listing URLs, test accounts and available hooks.

Do NOT write any Playwright tests. Stop after Phase 1 and summarise
what was built and anything that differs from the spec.
```

For phases 2, 3 and 4, reuse the same prompt and change the phase number. Open questions to settle before phase 1: React or plain server-rendered pages for the front end, and Node or Python (FastAPI) for the API. The prompt above assumes Node and React because they match the TypeScript you'd use in Playwright.
