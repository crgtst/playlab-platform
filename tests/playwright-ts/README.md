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
| `specs/` | Tests, one file per story area. Each test name starts with its AC ID: `PLS-1.8 an expired session ...` |
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

`specs/auth.spec.ts` covers PLS-1.1 through PLS-1.6: successful and failed login, account lockout, logout, access-token
expiry and refresh. `specs/session.spec.ts` covers PLS-1.8: it advances the session clock 8 days (past both the
15-minute access token and 7-day refresh token), adds an item, and checks it lands in a guest cart with no error.
PLS-1.7 and the rest of the acceptance criteria remain to be covered.
