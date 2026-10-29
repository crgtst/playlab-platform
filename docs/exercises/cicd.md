# CI/CD exercises

## Beginner

1. **Read a run.** Open a workflow run and say what each job checked, how long it took, and which reports it uploaded.
2. **Break the build** (PLS-29.4). Name an AC that does not exist in a test, open a pull request, and watch
   `npm run traceability:sources` fail it.

## Intermediate

3. **Start the stack once.** Use the `start-stack` action in a new workflow that runs your own suite.
4. **A gate.** Add your suite's check to `.github/rulesets/main-gates.json` and run `node tools/ci/check-ruleset.mjs`. Why does it
   refuse a check that only runs on some pull requests?
5. **Traceability** (PLS-29.2). Make your suite write JUnit XML, add it to the report, and find your tests in
   `docs/traceability.md`.

## Advanced

6. **The nightly sweep** (PLS-29.3). Switch off the forcing and see the sweep report a defect missed. Delete a test, find which
   defect now escapes, and explain why a sweep over random defects finds gaps that a normal run does not.
7. **Speed.** Take the slowest required job and make it faster without making it weaker. Show the before and after.
8. **Flaky gates.** A required check fails one run in twenty. Decide whether to retry, quarantine, or fix, and write the
   policy.
