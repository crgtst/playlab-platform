# Traceability

Merges the JUnit XML every suite under `tests/` writes into [`docs/traceability.md`](../../docs/traceability.md): each
acceptance criterion, which tools cover it, the last result, and which defects a passing test catches.

```bash
npm run traceability         # write docs/traceability.md from the reports on disk
npm run traceability:check   # exit 1 if a test names an AC ID that does not exist
npm run traceability:gate2   # exit 1 unless Gate 2 holds
npm run test:tools           # the script's own tests
```

How a test is matched:

- An AC is covered by a test whose name contains its ID (`PLS-5.2 ...`). `PLS-25.4 and 25.5` and `PLS-1.1, 1.2` name
  every ID in the list.
- A defect is caught by a **passing** test whose name contains the defect's name (`... detects the lost-update defect`).
- Report files are `junit*.xml` or `TEST-*.xml` anywhere under `tests/<suite>/`; the folder name is the tool.

The reports are whatever the last run wrote, so run a whole suite first (a partial run leaves a partial report). For
Playwright that is `cd tests/playwright-ts && npx playwright test`, which writes `results/junit.xml`.

[`scope.json`](scope.json) lists what is not a gap: ACs the platform does not build yet, ACs another tool or the app's
own tests cover, the three defects added in Phase 1 (so "original defects" is 33), and the Gate 2 story range. Update
it when the platform builds something new.
