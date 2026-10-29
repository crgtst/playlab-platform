# Changelog

All notable changes to PlayLab Platform. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/): a new defect, a changed acceptance criterion or a changed test hook is
a minor version at least; a breaking change to a hook or to the shared test data is a major one.

## [1.0.0] - Unreleased

The first public release: the platform, its 47 defects and the suites that catch them.

### Added

- **The shop.** A React storefront and an Express 5 API on Node 24 with Postgres: catalogue, cart, discount codes, checkout with
  a cross-origin payment frame, orders, wishlist, accounts, and an admin area. Live order status over WebSocket and live
  stock over Server-Sent Events.
- **Bug mode.** 47 named defects, each switched on with `POST /test/bugs` (or per test session) and each mapped to the
  acceptance criterion it breaks.
- **A specification.** 29 stories and 174 numbered acceptance criteria in `docs/ACCEPTANCE_CRITERIA.md`.
- **A Test guide.** A page in the shop (`/guide`, linked from the footer when test hooks are on) and `GET /test/guide` that list the test accounts, cards, discount codes, fixtures, scenarios and every defect in one place (PLS-12.6, PLS-12.7).
- **Test hooks.** Test sessions (isolated defects, clock, latency, chaos and rate limit for each test), reset, named fixtures,
  throwaway and bulk users, a seeded data generator, provider states, a test mailbox, logs and Prometheus metrics.
- **Platform behaviour for testing.** Correlation IDs and JSON logs, an order lifecycle with allowed transitions, optimistic
  locking with `If-Match`, account and user administration, security headers, an avatar import with an SSRF guard, a
  performance profile with Prometheus and Grafana.
- **Test suites**, one folder each under `tests/`: Playwright (TypeScript), Postman/Newman, Karate, REST Assured, contract
  (Spectral, `oasdiff`, Schemathesis, Pact), security (OWASP API Top 10 and ZAP), k6 and JMeter.
- **Reports.** A traceability report (AC by tool by result, and a defect matrix), a security report, and a k6 and JMeter
  Grafana dashboard.
- **CI/CD.** Fifteen workflows: a reusable `start-stack` action, a merge rule, a nightly run that switches on random defects
  and fails if one is missed, a report site, CodeQL, Trivy, and multi-architecture images on GHCR.
- **For learners.** Graded exercises for every skill in `docs/exercises/` and an answer key in `docs/answers/`.

### Known limits

- The k6 and JMeter limits are calibrated on one machine; a slower runner may need a wider factor (`FACTOR=` in `tools/calibrate`).
- The soak test has been run for three minutes, not the full hour.
- A few Playwright tests (PLS-5.11, PLS-8.1, PLS-8.4) have failed now and then under a full parallel run. They pass alone and on repeat.
- Playwright for Java and Python (phase 4) and PlayLab Pay (phase 5) are not part of 1.0.0.
