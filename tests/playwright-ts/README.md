# Playwright (TypeScript)

The canonical suite: every AC, every browser project. Phase 2.

Planned techniques: page objects, role fixtures, a `storageState` setup project, 4 browser projects, sharding, tags, a
custom matcher, an AC traceability reporter, visual (`toHaveScreenshot`) and axe checks, and Playwright `request`
tests for API setup and checks. Component tests, UI mode and the test agents are Node-only, so they live here alone.

Showcase: the **defect matrix**, where CI switches on each defect in turn and shows which tests went red.

Not to be confused with `app/e2e/`, the platform's own smoke suite.
