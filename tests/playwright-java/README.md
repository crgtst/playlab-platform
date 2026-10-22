# Playwright (Java)

JUnit 5 (`@UsePlaywright`) and Maven. Phase 4, after the TypeScript suite has settled the page objects and data
contract.

Covers the parity core (about 35 ACs, listed in `docs/REVIEW_AND_PLAN.md`), using the same page-object names and
methods as `playwright-ts/` and the data in [`../shared/`](../shared/).

Can share a parent Maven POM with `rest-assured/` and `karate/`.
