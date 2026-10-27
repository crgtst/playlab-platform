# Security test report

PlayLab is a deliberately breakable shop, and its security defects are switched on one at a time. This report says what the security
suite proves about each of the OWASP API Security Top 10 (2023) risks, and what an OWASP ZAP scan finds on top of that.
It is written by `npm run security:report` from the reports the suites leave on disk; nothing here is typed by hand except
the notes on ZAP alerts.

**Only ever run these tests and scans against your own local stack.**

## What each test proves

For every risk there is a **secure test** and a **defect test**:

- The secure test asserts the safe behaviour (a customer gets 404 for someone else's order). It passes on the normal API.
- The defect test switches on the defect that breaks it and asserts the exploit works. It shows the test can see the problem.
- The defect matrix switches each defect on and runs the secure test of its AC. The secure test must **fail**: if it did not,
  it would not notice the same flaw in a real API.

## Results by risk

The suite ran 31 tests: 31 passed.

| Risk | AC | Defect | Secure test | Defect test | Fails with the defect on |
| --- | --- | --- | --- | --- | --- |
| API1 Broken Object Level Authorization | PLS-24.1 | `order-leak` | pass | pass | yes (1 of 1) |
| API2 Broken Authentication | PLS-24.2 | `jwt-alg-none` | pass | pass | yes (1 of 1) |
| API2 Broken Authentication | PLS-24.2 | `token-never-expires` | pass | pass | yes (1 of 1) |
| API2 Broken Authentication | PLS-24.3 | `user-enumeration` | pass | pass | yes (1 of 1) |
| API3 Broken Object Property Level Authorization | PLS-24.4 | `mass-assignment-role` | pass | pass | yes (1 of 1) |
| API3 Broken Object Property Level Authorization | PLS-24.5 | `excessive-data-exposure` | pass | pass | yes (1 of 1) |
| API4 Unrestricted Resource Consumption | PLS-24.6 | `rate-limit-bypass` | pass | pass | yes (1 of 1) |
| API4 Unrestricted Resource Consumption | PLS-24.7 | `no-page-limit` | pass | pass | yes (1 of 1) |
| API5 Broken Function Level Authorization | PLS-24.8 | `bfla-admin-users` | pass | pass | yes (1 of 1) |
| API6 Unrestricted Access to Sensitive Business Flows | PLS-24.9 | `single-use-reused` | pass | pass | yes (1 of 1) |
| API7 Server Side Request Forgery | PLS-24.10 | `ssrf-avatar-url` | pass | pass | yes (1 of 2) |
| API8 Security Misconfiguration | PLS-24.11 | `missing-security-headers` | pass | pass | yes (2 of 2) |
| API8 Security Misconfiguration | PLS-24.12 | `verbose-errors` | pass | pass | yes (1 of 1) |
| API9 Improper Inventory Management | PLS-24.13 | `shadow-api-v0` | pass | pass | yes (1 of 1) |
| API10 Unsafe Consumption of APIs | PLS-24.14 | `trust-address-provider` | pass | pass | yes (1 of 1) |

## OWASP ZAP

ZAP finds a different kind of problem from the tests above: it does not know the shop, so it reports what any scanner would.
Alerts that are expected for a local lab (and why) are listed in `tests/security/zap/baseline-rules.tsv` and `api-rules.tsv`.

### Baseline scan of the web app

A passive scan: ZAP spiders the pages and reads what comes back. It sends no attack payloads. ZAP 2.17.0, generated Tue, 27 Oct 2026 14:19:58.

13 alert types: 0 high, 3 medium, 4 low, 6 informational.

| Risk | Alert | Instances | Rule |
| --- | --- | ---: | --- |
| Medium | CSP: Failure to Define Directive with No Fallback | 1 | 10055 |
| Medium | CSP: script-src unsafe-inline | 1 | 10055 |
| Medium | CSP: style-src unsafe-inline | 2 | 10055 |
| Low | Cross-Origin-Embedder-Policy Header Missing or Invalid | 3 | 90004 |
| Low | Cross-Origin-Opener-Policy Header Missing or Invalid | 3 | 90004 |
| Low | Cross-Origin-Resource-Policy Header Missing or Invalid | 5 | 90004 |
| Low | Timestamp Disclosure - Unix | 5 | 10096 |
| Informational | Information Disclosure - Information in Browser localStorage | 1 | 120000 |
| Informational | Information Disclosure - Suspicious Comments | 1 | 10027 |
| Informational | Modern Web Application | 5 | 10109 |
| Informational | Non-Storable Content | 1 | 10049 |
| Informational | Storable and Cacheable Content | 2 | 10049 |
| Informational | Storable but Non-Cacheable Content | 5 | 10049 |

### API scan from the OpenAPI file

An active scan: ZAP reads `openapi.yaml` and sends attack payloads to every operation, as an admin. The test hooks, the payment frame and `DELETE /users/me` are left out. ZAP 2.17.0, generated Tue, 27 Oct 2026 14:10:51.

7 alert types: 0 high, 1 medium, 2 low, 4 informational.

| Risk | Alert | Instances | Rule |
| --- | --- | ---: | --- |
| Medium | HTTP Only Site | 1 | 10106 |
| Low | Cross-Origin-Resource-Policy Header Missing or Invalid | 5 | 90004 |
| Low | Unexpected Content-Type was returned | 13 | 100001 |
| Informational | A Client Error response code was returned by the server | 545 | 100000 |
| Informational | Authentication Request Identified | 1 | 10111 |
| Informational | Non-Storable Content | 5 | 10049 |
| Informational | User Agent Fuzzer | 5 | 10104 |

### Notes on the alerts

Both scans run against the local stack, with the rate limit off. They fail the run only for the rules marked FAIL in
`baseline-rules.tsv` and `api-rules.tsv`; everything else is reported and explained here.

**What fails the run.** In the baseline scan, a missing anti-clickjacking, `X-Content-Type-Options`, Content-Security-Policy or
Permissions-Policy header (a regression of PLS-24.11). In the API scan, SQL injection, reflected or persistent XSS, path traversal,
OS or server-side code injection, SSRF and application error disclosure. All passed.

**What the baseline scan reports, and why it is accepted:**

| Alert | Why it stays |
| --- | --- |
| CSP: `style-src` allows `unsafe-inline` (still a WARN) | React writes inline `style` attributes, which a strict `style-src` blocks. Scripts are `'self'` only, so this does not open script injection. The wildcard `ws:`/`wss:` in `connect-src` that ZAP also reported was removed: `'self'` covers same-origin WebSockets. |
| Cross-Origin-Embedder / Opener / Resource-Policy missing | These isolate a page from other origins. The shop frames a payment page from the API's origin, so a strict policy would break checkout. The lab has no sensitive cross-origin reads to protect. |
| CSP: `script-src` allows `unsafe-inline` (still a WARN) | Only on the Swagger UI page at `/api/docs`, which Swagger UI needs. The shop itself and the API responses do not. |
| CSP: failure to define a directive with no fallback (still a WARN) | One redirect (`/api/docs` to `/api/docs/`) is answered by Express's static file server with its own `default-src 'none'` header. It has no body to attack. |
| Strict-Transport-Security, HTTP only site | The lab runs over plain `http://localhost`; HSTS on HTTP is ignored by browsers, and there is no HTTPS to move to. |
| Suspicious comments, Unix timestamps | Found in the bundled JavaScript and the Swagger UI library (a `TODO` in a router, hash constants that look like dates). Not the shop's data. |
| Non-storable content, "Modern Web Application", localStorage | Informational. `Cache-Control: no-store` on account data is deliberate, the shop is a single-page app, and `localStorage` holds only the language, currency and theme. |

**What the API scan reports, and why it is accepted:**

| Alert | Why it stays |
| --- | --- |
| A client error response code was returned | The scan sends bad input on purpose; 404, 422 and 401 are the right answers. |
| Unexpected Content-Type (`GET /orders/export.csv`) | A false positive: the endpoint returns `text/csv`, which `openapi.yaml` documents. ZAP expects JSON. |
| Cross-Origin-Resource-Policy missing | As above: the API is read by the shop on its own origin, and the payment frame is cross-origin on purpose. |
| Authentication request identified, non-storable content | Informational. |

