# API security testing

OWASP API Security Top 10 (2023) tests, with the defect that makes each one fail, and OWASP ZAP scans, written up as a
[security test report](../../docs/security-report.md).

**Only ever run these against your own local stack.**

## What is here

| | |
| --- | --- |
| `specs/api1-…` to `api10-…` | One file for each OWASP API risk. Playwright Test with the `request` fixture only: no browser. |
| `support/` | The same helpers as the other suites: the stack's URL from `app/.env`, test sessions, throwaway users, JWT forging. |
| `run-defect-matrix.mjs` | Switches each defect on in turn and runs the secure test of its AC. The test must fail. |
| `zap/` | ZAP: `run-zap.sh` (baseline scan of the web app, API scan from `openapi.yaml`), the rules that decide what fails, and `NOTES.md` explaining every accepted alert. |

Each risk has two kinds of test, named after the AC they cover (`PLS-24.1 ...`):

- **A secure test** asserts the safe behaviour: a customer gets 404 for someone else's order. It passes on the normal API.
- **A defect test** (`PLS-24.1 defect order-leak ...`) switches on the defect that breaks it, in the test's own session, and asserts the
  exploit works. That shows the suite can see the problem, and it is what the traceability report counts as "the defect is caught".

| OWASP API risk | AC | Defects |
| --- | --- | --- |
| API1 Broken Object Level Authorization | 24.1 | `order-leak` |
| API2 Broken Authentication | 24.2, 24.3 | `jwt-alg-none`, `token-never-expires`, `user-enumeration` |
| API3 Broken Object Property Level Authorization | 24.4, 24.5 | `mass-assignment-role`, `excessive-data-exposure` |
| API4 Unrestricted Resource Consumption | 24.6, 24.7 | `rate-limit-bypass`, `no-page-limit` |
| API5 Broken Function Level Authorization | 24.8 | `bfla-admin-users` |
| API6 Unrestricted Access to Sensitive Business Flows | 24.9 | `single-use-reused` |
| API7 Server Side Request Forgery | 24.10 | `ssrf-avatar-url` |
| API8 Security Misconfiguration | 24.11, 24.12 | `missing-security-headers`, `verbose-errors` |
| API9 Improper Inventory Management | 24.13 | `shadow-api-v0` |
| API10 Unsafe Consumption of APIs | 24.14 | `trust-address-provider` |

## Run it

Start the stack from `app/` with `docker compose up --build -d` (the default rate limit of 100 a minute: PLS-24.6 tests it).

```bash
cd tests/security
npm install
npm test                   # every secure and defect test; writes results/junit.xml
npm run test:defects       # the matrix: each defect on, its secure test must fail; writes results/defect-matrix.md
npm run typecheck
```

Every test runs in its own test session (`X-Test-Session`), so a defect switched on in one test reaches no other and the tests run
in parallel. `DEFECTS=name,name npx playwright test` switches defects on for every secure test, which is what the matrix does.

## ZAP

ZAP needs a different stack: no rate limit (it sends thousands of requests), a long token life, and permission for its container
to reach the web app.

```bash
cd app && RATE_LIMIT_PER_MIN=0 ACCESS_TOKEN_TTL_SEC=7200 WEB_ALLOWED_HOSTS=host.docker.internal docker compose up --build -d && cd ..
bash tests/security/zap/run-zap.sh            # both scans, about 10 minutes; or: baseline | api
```

The API scan uses a copy of `openapi.yaml` without the test hooks, the payment frame and `DELETE /users/me`, and runs as a throwaway
admin. It changes data (it deletes and edits products), so `POST /test/reset` afterwards. A finding fails the run only if its rule is
marked `FAIL` in `zap/baseline-rules.tsv` or `zap/api-rules.tsv`.

## The report

```bash
npm run security:report    # from the repo root: writes docs/security-report.md
```

The report merges the JUnit file, the defect matrix and the ZAP JSON. CI builds it in the `security` workflow.

## Adding a risk or a defect

1. Add the defect to `app/api/src/lib/bugs.ts` and its AC to `docs/ACCEPTANCE_CRITERIA.md`.
2. Write the secure test and the defect test in the spec for its OWASP risk. The title of the defect test must be
   `PLS-24.n defect <name> ...`; the matrix finds the defects by that title.
3. Add the defect to `RISKS` in `tools/security-report/report.mjs`.
