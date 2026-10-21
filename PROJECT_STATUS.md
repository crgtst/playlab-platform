# PlayLab Platform: Project Status

Plan: `docs/REVIEW_AND_PLAN.md`
Last updated: 2026-10-21

## Current phase

Phase 0: Foundations (branch `phase-0-foundations`)

## Next task

Phase 0, task 4: write the landing README draft and `SECURITY.md`.

## Done

- 2026-10-21: Phase 0 task 3. `.github/workflows/quality.yml` (push to main, PRs, manual): lint + format check,
  typecheck for api and web (matrix), and API unit tests, all on Node 24 with `npm ci`. Vitest 5 + supertest
  in `app/api` (`npm test`, `npm run test:watch`; tests in `app/api/test/`, typechecked via `test/tsconfig.json`).
  18 tests, no database needed: pricing maths and its bug switches, the bug registry (isolation, TEST_HOOKS guard),
  and HTTP basics through `createApp()` (404 envelope, bad JSON, per-field validation, extended query parser,
  OpenAPI, hooks off/on). Removing the Express 4 compatibility settings fails 2 tests. Jobs run green in a clean
  copy locally; actionlint clean. Not yet run on GitHub (branch not pushed).
- 2026-10-21: Phase 0 task 2. Root `package.json` holds repo-wide tooling only (no workspaces, so the
  app lockfiles and Dockerfiles are unchanged): ESLint 10 flat config (`eslint.config.mjs`, with
  typescript-eslint, react-hooks and eslint-config-prettier), Prettier 3 (single quotes, width 140 to match
  the existing style), `.editorconfig`, and husky + lint-staged running on pre-commit. Scripts: `npm run lint`,
  `lint:fix`, `format`, `format:check`. One-off format of 56 code files: 53 minify to identical output, and
  3 only split JSX whitespace with the same rendered text. API probes and UI checkout are unchanged. Local
  `.DS_Store` files deleted (already untracked and ignored). Dependabot now covers the root `package.json` too.
- 2026-10-21: Phase 0 task 1. Node 24 LTS images (`node:24-alpine`), `@types/node` 24,
  Express 5.3.0, `@playwright/experimental-ct-react` 1.62.1, and `.github/dependabot.yml`
  (npm, docker, docker-compose, github-actions; weekly; Node, `@types/node` and Postgres majors ignored).
  Express 4 defaults kept where ACs depend on them: `query parser` set to `extended`, and `req.body`
  defaults to `{}`. 46 API probes give the same responses as on Express 4; UI checkout with card 4242
  reaches the confirmation; the CT harness mounts a component.

- 2026-10-21: Baseline confirmed. Stack starts healthy; checkout with card 4242 places an order.
- 2026-10-21: Compose project renamed `playlab-shop` to `playlab-platform` (containers, volume, images).

## Decisions

| # | Decision | Outcome | Date |
|---|----------|---------|------|
| 1 | Rename repo to `playlab-platform` | Agreed (compose project renamed; GitHub repo rename pending) | 2026-10-21 |
| 2 | Tests in the same repo, one folder per suite | Open | |
| 3 | Second Playwright language: Java or Python | Open | |
| 4 | Go public at v1.0.0 | Open | |
| 5 | Pact files in repo before a broker | Open | |
| 6 | .NET suite | Open | |
| 7 | v2.0 FastAPI spec marked historical; PlayLab Pay (FastAPI) added as Phase 5 stretch | Agreed | 2026-10-21 |

## Known issues

- `app/.env.example` hard-codes `PAYMENT_FRAME_URL=http://localhost:3000/pay/frame`.
  Changing `API_PORT` alone leaves the payment frame on the wrong port (404).
  Fix in Phase 0: remove the line and let `docker-compose.yml` derive it from `API_PORT`.
- README examples assume port 3000.
- Express 5's automatic `OPTIONS` reply is now `text/plain` with `Allow: GET, HEAD, POST`
  (it was `text/html` with `GET,HEAD,POST`). No AC or spec covers it.
- The latest CT package is 1.62.1. `@playwright/test` is at 1.64.1 (the version the plan cites) because the CT
  packages trail it. CT 1.62 bundles its own Vite 8, while the app still builds with Vite 5.4. Moving
  the app to Vite 8 is left to Dependabot or a later task.
- Lint gives 0 errors and 23 `no-explicit-any` warnings, all from untyped pg rows in the API.
  The rule is `warn` until row types are added.
- Not formatted by Prettier: Markdown (tables are aligned by hand), HTML (reflowing can change text tests assert on),
  `openapi/` and SQL migrations, and `tests/` (each suite brings its own setup).
- After cloning, run `npm install` at the repo root once to install the pre-commit hook. Add this to the README in task 4.
- `README.md` has no final newline; task 4 rewrites it.
- `multer` 1.4.5-lts.1 is deprecated with known vulnerabilities (fixed in 2.x). Expect a Dependabot major PR.

## Local environment notes

- API on 3001 (`app/.env`): port 3000 is taken by the `open-webui` container.
