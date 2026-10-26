# Postman / Newman

Eight collections, one per API domain, run with Newman. Every response is checked against the shared JSON Schemas in
[`../shared/schemas/`](../shared/schemas/), every test name starts with its AC ID (so the traceability report finds it),
and the run needs nothing set up by hand: it makes its own test session and its own users.

Showcase: a **data-driven registration run** of 50 boundary inputs, an **HTML report** per collection, and a **defect
matrix** that switches on each API-side defect in turn and shows which requests catch it.

## Running it

Start the stack from `app/` (`docker compose up --build -d`), then:

```bash
cd tests/postman
npm install
npm test                         # every collection against the stack from app/.env, reports in results/
npm test -- --only 06            # one collection (any part of its name)
npm test -- --env ci             # another environment: local (default), ci or perf
npm test -- --defect lost-update # switch defects on for the run, to see what catches them
npm run test:defects             # the defect matrix, results/defect-matrix.md (resets the stack between runs!)
npm run build                    # rebuild collections/ and data/ after changing anything in src/
```

The address is `http://localhost:<API_PORT from app/.env>`; set `BASE_URL` to override it. Results: one HTML report
(`results/<collection>.html`) and one JUnit file (`results/junit-<collection>.xml`) per collection.

## What is where

| Path | What it holds |
| --- | --- |
| `collections/*.postman_collection.json` | The collections. **Generated**: import them into the Postman app, or run them with Newman |
| `src/collections/*.mjs` | The collections' sources: one readable request at a time, with its test script |
| `src/prelude.js` | The helpers every script can use (`PL`, below). The build copies it into each script |
| `src/dsl.mjs`, `src/build.mjs` | `request()`, `folder()` and `collection()`, and the build that writes the JSON |
| `src/data/*.mjs`, `data/*.csv` | The data-driven run's 50 rows (source and generated CSV) |
| `environments/` | `local`, `ci` and `perf`: the response-time budget and whether the rate limit is on |
| `run.mjs`, `defects.mjs` | The Newman runner, and the defect matrix |

The collections are generated because a Postman script cannot import anything: without a build, the same 60 lines of
helpers would be pasted into every request. Edit `src/`, run `npm run build`, and commit both; CI fails if they differ.

| Collection | Covers |
| --- | --- |
| `01-auth` | PLS-1: login, wrong password, lockout, refresh, logout, token expiry |
| `02-registration` | PLS-2: registration, the mailbox, duplicates, accents, validation, password reset; PLS-24.3 and 24.4 |
| `03-registration-data` | PLS-2.1, 2.3, 2.4: 50 boundary inputs for name, email and password, from `data/03-registration-data.csv` |
| `04-catalogue` | PLS-3, 24.7: search, filters, sort and paging across every page, one product, categories |
| `05-cart-discounts` | PLS-4, 5, 24.9: quantities, stock, exact totals, every discount outcome, a single-use code raced |
| `06-orders` | PLS-6, 7, 20, 21: card success, decline, timeout, replay, history, access, lifecycle, ETags, paying twice |
| `07-admin-accounts` | PLS-8, 9, 21, 22, 23, 24.8: product CRUD, CSV export, avatar limits, your account, user admin |
| `08-api-standards` | PLS-10, 13.1, 24.6: error shape, every readable response against its schema (10.4), rate limit, ETags |

## Writing a request

```js
request({
  name: 'Apply SAVE10',
  method: 'POST',
  path: '/api/v1/cart/discount',
  as: 'customer:disc',                     // sent as this throwaway user: "customer", "admin", "support", "customer:anything"
  body: '{"code": "SAVE10"}',
  pre: `await PL.addToCart('customer:disc', 'EL-008', 2);`,   // runs before the request
  test: `
    PL.status('PLS-5.1', 200, 'a valid code returns 200');     // pm.test("PLS-5.1 a valid code returns 200")
    PL.schema('PLS-5.1', 'Cart');                              // the response against tests/shared/schemas/Cart.json
    PL.ac('PLS-5.1', '10% comes off', () => pm.expect(PL.json().totals.discountCents).to.eql(1800));`,
});
```

`PL` gives scripts: `call()` for extra API calls, `user()` and `as` for tokens, `addToCart()`, `placeOrder()`, `product()`
(from `tests/shared/products.json`), `schema()` and `matches()`, `status()` and `errorCode()`, `set()` and `get()` for
values that must survive between requests, and `ac()`, which also takes an `async` function when the check needs the API.
Every request also gets a "responds within the time budget" test from the environment's `responseTimeMs`.

## How it keeps runs apart

- The run makes a **test session** (PLS-28) and sends it on every request, so its defects, clock and rate limit are its
  own. Switching a defect on with `--defect` affects only this run.
- Users are throwaway (`POST /test/users`), made the first time a request needs them. Orders are cancelled and stock put
  back by the end of each collection, so runs repeat without a reset.
- `baseUrl`, the schemas and the shared data are given to Newman by `run.mjs`, never kept in an environment file.

## Limits

- A Postman script cannot attach a binary file, so avatar uploads cover the rejections (PLS-9.2, 9.3) but not a valid
  PNG (PLS-9.1, which Playwright covers).
- The live stock stream (`stale-stock`) is a server-sent event stream, which Newman does not read; Playwright covers it.
- `npm audit` reports advisories in Newman's dependencies. It is a test tool run against a local stack, and not shipped.
