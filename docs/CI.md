# Pipelines

Everything runs in GitHub Actions. Each pipeline starts the stack the same way, with the [`start-stack`](../.github/actions/start-stack/action.yml)
action (`.env.example` on ports 3002 and 5174, Docker Compose, wait until healthy), runs one kind of check, and uploads its reports.

| Workflow | Runs on | What it checks | Required to merge |
| --- | --- | --- | --- |
| `quality` | every pull request, push to main | Lint and format, typecheck (api, web, e2e), API unit tests, API integration tests against a fresh Postgres (PLS-29.5), the traceability script's tests, **AC IDs named by tests exist** (PLS-29.4) | yes |
| `smoke` | every pull request, push to main | The platform's own end-to-end tests, with the stack started from `.env.example` (PLS-12.5) | yes |
| `playwright`, `postman`, `karate`, `rest-assured` | every pull request, push to main | The four functional suites | yes |
| `contract` | every pull request, push to main | Spectral lint, `oasdiff` breaking changes, Pact consumer tests, Schemathesis fuzzing as a customer and as an admin (PLS-26) | yes |
| `security` | every pull request, push to main | The OWASP API Top 10 suite and its defect matrix, and the ZAP baseline and API scans (PLS-24) | yes |
| `performance` | a pull request that touches a load suite, the load model or the perf profile; push to main; by hand | k6 and JMeter at the real rates for 30 seconds (`full` for 5 minutes) (PLS-27) | no (it runs on only some pull requests) |
| `nightly` | 02:17 UTC every day; by hand | **The defect sweep** (PLS-29.3) | n/a |
| `pages` | after a pipeline finishes on main; by hand | Collects the latest reports into one site, publishes it, and runs the release gate | n/a |

## The merge rule (PLS-29.1)

[`.github/rulesets/main-gates.json`](../.github/rulesets/main-gates.json) lists the 17 checks a pull request must pass before it can be merged
into `main`, and stops `main` being deleted or force-pushed. `tools/ci/check-ruleset.mjs` (run in `quality`) fails if the rule names a check no
workflow produces, or a check that only runs on some pull requests, because either would make every pull request wait forever.

`tools/ci/apply-ruleset.sh` creates or updates the rule through the API. **It is not applied yet:** GitHub only allows rulesets and branch
protection on a public repository or a paid plan, and this repository is private on the free plan (`gh api` answers "Upgrade to GitHub Pro or
make this repository public"). Run the script when the repository goes public at v1.0.0. Until then the gates run and report on every pull
request, but nothing stops a merge.

## The nightly defect sweep (PLS-29.3)

`node tools/nightly/defect-sweep.mjs` picks defects at random, seeded by the date so a failed night can be repeated, and for each one switches
it on (`DEFECTS=name`) for the tests of the ACs it names, in the Playwright suite and the security suite. The defect is caught if a test
fails. A defect no test fails for is **missed**, and the run fails. `--all` sweeps all 47; `--count` and `--seed` change the sample.
The result is in the run summary and the `nightly-sweep` artifact.

## The report site (PLS-29.2)

`pages` runs `tools/pages/collect.sh` (downloads the report artifacts from each pipeline's latest successful run on main),
`tools/traceability/trace.mjs --reports ... --out` (rewrites the traceability report from them) and `tools/pages/build-site.mjs` (the index
and the Markdown reports as HTML). Then it deploys to GitHub Pages and runs `trace.mjs --gate3`.

Pages is not available to a private repository on the free plan either, so for now the site is built and kept as the `pages-site` artifact of
the run, and the deploy job is skipped. When the repository is public, set Settings, Pages, Source to "GitHub Actions" once.

## The gate (PLS-29.4)

Two checks, the second over everything the pipelines produced:

- `npm run traceability:sources` fails a pull request if a test source names an AC ID that does not exist (no results needed).
- `trace.mjs --gate3`, in `pages`, fails if an in-scope AC has no passing test, a test fails, or a defect is built that no passing test catches.
  A defect no test names also fails the API unit tests (`app/api/test/bugs.test.ts`), on the pull request.

## Running a pipeline's steps locally

| | |
| --- | --- |
| The defect sweep | `API_PORT=3000 node tools/nightly/defect-sweep.mjs --count 5` against a stack on the default rate limit |
| The release gate | `npm run traceability:gate3` (reads the reports on disk; run the suites first) |
| The merge rule's check | `node tools/ci/check-ruleset.mjs` |
| The report site | `GH_TOKEN=$(gh auth token) tools/pages/collect.sh out && node tools/traceability/trace.mjs --reports out/trace --out out/site/traceability.md && node tools/pages/build-site.mjs out/site` |
