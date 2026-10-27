# Test suites

One folder per suite. Each brings its own build, dependencies and formatter settings. The roadmap is in
[`docs/REVIEW_AND_PLAN.md`](../docs/REVIEW_AND_PLAN.md); what to test is in
[`docs/SPEC.md`](../docs/SPEC.md) and [`docs/ACCEPTANCE_CRITERIA.md`](../docs/ACCEPTANCE_CRITERIA.md).

| Folder | Tools | Phase |
| --- | --- | --- |
| [`playwright-ts/`](playwright-ts/) | Playwright Test (TypeScript): the canonical UI and API suite | 2 |
| [`postman/`](postman/) | Postman collection, run with Newman | 2 |
| [`karate/`](karate/) | Karate | 2 |
| [`rest-assured/`](rest-assured/) | REST Assured, JUnit 5, Maven | 2 |
| [`contract/`](contract/) | Spectral, Schemathesis, oasdiff, Pact | 3 |
| [`security/`](security/) | OWASP API Top 10 tests (Playwright `request`), ZAP | 3 |
| [`k6/`](k6/) | k6 (Docker): smoke, load, soak, overload, stress, spike | 3 |
| [`jmeter/`](jmeter/) | JMeter: `.jmx` plans, non-GUI runs | 3 |
| [`playwright-java/`](playwright-java/) | Playwright for Java, JUnit 5, Maven | 4 |
| [`playwright-python/`](playwright-python/) | Playwright for Python, pytest | 4 |

## Rules every suite follows

1. Test names start with the AC ID they cover (`PLS-5.2 expired code is rejected`), so one report can merge every
   tool and language.
2. Accounts, product IDs, test cards, discount codes, fixture names and response schemas come from
   [`shared/`](shared/). No suite hard-codes them.
3. Page objects use the same names and methods in every language (`CartPage.applyCode`).
4. Every suite writes JUnit XML, the input to the traceability report.
5. Base URLs come from the environment, never a hard-coded port: the API is on `API_PORT` and the web app on
   `WEB_PORT` from `app/.env` (3000 and 5173 by default).

## Before each run

Start the stack from `app/` with `docker compose up --build -d`, and wait until
`GET http://localhost:${API_PORT}/api/v1/health` returns 200. Reset with `POST /test/reset` (about 50 ms) before a test
or suite that needs the seeded data. Tests that run in parallel can each use their own test session
(`POST /test/sessions`) and their own users (`POST /test/users`), so they don't see each other's defects or data.
The test hooks are described in [`app/README.md`](../app/README.md).
