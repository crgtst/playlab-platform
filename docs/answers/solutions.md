# Worked solutions

> [!CAUTION]
> **Spoilers.** Try the [exercises](../exercises/) first.

The suites under `tests/` are one worked solution for each exercise. This page says where to look, and lists the points that
cost the most time while they were written.

## Playwright

Suite: [`tests/playwright-ts`](../../tests/playwright-ts/README.md). Specs are grouped by feature under `specs/`, and every test
name starts with its AC ID.

| Exercise | Look at |
| --- | --- |
| 1 to 3 | `specs/auth/login.spec.ts`, `specs/catalogue/`, `specs/checkout/` |
| 4 | `specs/discounts/codes.spec.ts` |
| 5, 6 | `specs/checkout/`, `specs/orders/`, `specs/admin/` |
| 7 | `specs/accessibility/` |
| 8 | The fixtures in `support/`: each test gets its own test session and user |
| 9 | `specs/browser/` and `support/browser.ts` |
| 10 | `specs/auth/login.spec.ts` (lockout expiry) |

Points that catch people out:

- **Shared state.** A browser context made with `browser.newContext()` inherits the test's `X-Test-Session` header. A "no
  session" context needs `extraHTTPHeaders: {}`.
- **Accessibility scans and theme changes.** Emulate reduced motion, or the colour transition makes contrast fail for a moment.
- **Cleanup.** A product that has been ordered cannot be deleted, so restore its stock in `afterAll` (not a file-level hook, which
  runs for each worker).
- **A race you wrote yourself.** A test that creates a throwaway product can run while another counts the catalogue. Name
  throwaway products so they sort last, and check that every seeded product is present once, not an exact total.

## API testing

| Tool | Suite | Look at |
| --- | --- | --- |
| Postman and Newman | [`tests/postman`](../../tests/postman/README.md) | `src/` (the sources) and `collections/` (the built JSON); `defects.mjs` runs each defect |
| Karate | [`tests/karate`](../../tests/karate/README.md) | `src/test/resources/features/`, and the Java helpers for races and forged tokens |
| REST Assured | [`tests/rest-assured`](../../tests/rest-assured/README.md) | `ConcurrencyTest` (20 customers, one winner), `AuthTest` (forged tokens) |

- **Concurrency** (exercise 9): fire the requests at the same moment from threads. The suite checks exactly one 201 and nineteen 409s.
- **Schemas** (exercise 5): REST Assured's own JSON Schema matcher only reads draft-04, so the suite uses `networknt`.
- **Karate** keeps a cookie jar, and the cookie wins over a header. `match` splits at the first `==`.
- **Newman** crashes, instead of failing a test, if an async assertion fails and the helper does not catch it.

## Contract

Suite: [`tests/contract`](../../tests/contract/README.md) and `tools/contract`.

- Spectral rules are in `.spectral.yaml`. `oasdiff` runs in the `contract` workflow with `--fail-on ERR`.
- Schemathesis found real defects in this API: ids above 2147483647, a null character in a query string, an object where a string
  belongs, and unlisted methods. Each became an AC (PLS-26.6, PLS-26.7) and an integration test.
- Pact: consumer tests in `app/web/pact/`, the committed contract in `app/web/pacts/`, provider checks in
  `app/api/test/integration/pact.int.test.ts`. `oasdiff` is good at removed or renamed fields; Pact is good at what this one
  consumer actually reads, so a change nobody reads passes Pact and fails the diff.

## Security

Suite: [`tests/security`](../../tests/security/README.md), the report in [`docs/security-report.md`](../security-report.md).

- One spec for each OWASP API risk. Each AC has a secure test (must pass with the defect off) and a defect test (switches the
  defect on in its own session and shows the exploit). `npm run test:defects` checks the secure test fails for the right reason.
- SSRF: check the address when the connection is made and on every address the name resolves to, do not follow redirects, and
  open a new connection each time. A pooled connection to an allowed host skipped the check for a later request.
- ZAP's real findings here were a Content-Security-Policy that allowed any WebSocket host and missing `form-action`.

## Performance

Suites: [`tests/k6`](../../tests/k6/README.md) and [`tests/jmeter`](../../tests/jmeter/README.md), one load model in
`tests/shared/load-model.json`.

- **Log in once per shopper.** Logging in on every journey made bcrypt take most of the API's CPUs and failed the order SLO.
- **Ramp up.** Starting all shoppers at once made the first orders slow. Start them over some seconds, then measure.
- **Calibrated limits**: 60 ms for `GET /products` and 80 ms for `POST /orders`, from three runs of three minutes each. On this
  machine the worst times were 12 ms and 15 ms.
- **Capacity**: `GET /products` is fine at 200 requests a second and falls over between 300 and 400, because requests queue behind
  one Node process.

## CI/CD

See [`docs/CI.md`](../CI.md): the `start-stack` action, the merge rule, the nightly sweep (`tools/nightly`) and the report site
(`tools/pages`).
