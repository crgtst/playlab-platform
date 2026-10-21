# PlayLab Platform: Project Status

Plan: `docs/REVIEW_AND_PLAN.md`
Last updated: 2026-10-21

## Current phase

Phase 0: Foundations (branch `phase-0-foundations`)

## Next task

Phase 0, last task: settle the open decisions (2 to 6 below). Then Phase 0 is complete and PR #5 can leave draft.

## Done

- 2026-10-21: Phase 0 task 6. PLS-20 to PLS-29 added to `tests/ACCEPTANCE_CRITERIA.md`: 10 stories, 56 ACs
  (153 in total). Each story says which phase builds it. All 14 planned defects map to ACs, and four existing
  defects gained new AC IDs (`stock-oversell` 21.4, `order-leak` 24.1, `token-never-expires` 24.2,
  `single-use-reused` 24.9) in `bugs.ts` and `app/README.md`. The AC-map unit test now accepts the 14 planned
  defect names from an explicit list, and checks that 33 built + 14 planned = 47. Checked against the running
  API: PLS-24.2, 24.3, 24.4, 24.7, 24.9 and 24.13 already hold. PLS-24.6 fails: the `X-Forwarded-For` rate-limit
  bypass in finding A7 is confirmed.
- 2026-10-21: Phase 0 task 5 (finding A9). PLS-13 to PLS-19 audited against the web code.
  - Code changed to meet the AC: PLS-15.3 (copy fallback: `<id>-fallback` input with the text selected and
    `<id>-fallback-hint` "Press Ctrl+C to copy") and PLS-17.2 (offline cart: `checkout-button` disabled with
    `checkout-offline-message`, en and ga strings).
  - ACs reworded to match the build: 13.1 to 13.3 (results after "Find stores near me"), 13.2 and 17.1 (the
    build's messages; no Eircode), 14.1 (opt-in button, prompt on click), 16.1 (CSS animations, not carousels),
    18.2 (a tap advances, no full screen).
  - `bugs.ts`: the 7 Phase 4 defects now map to PLS-13.1, 13.2, 14.2, 15.1, 16.2, 17.3 and 19.2. The other 26
    already matched. A new unit test checks `bugs.ts` against the ACs' "Defect it catches" column (19 tests).
  - `app/README.md` defect table, Phase 4 notes and note 26 updated. Checked in the browser: 15.1, 15.3, 17.2
    and 18.2; API probes unchanged; checkout passes.
- 2026-10-21: Phase 0 task 4. Landing `README.md` draft: pitch, quality and licence badges, local-only warning,
  why it exists, quickstart (commands checked against the running stack), "what you can practise" table with
  honest suite status, Mermaid diagram of the current stack, layout, roadmap, and contributor commands.
  No defect catalogue (finding R4); the GIF is a TODO for Gate 3. `SECURITY.md`: local-only use,
  what is insecure on purpose, the `TEST_HOOKS=false` guard as it exists today, the planned production
  guard (R3), what to report, and reporting via GitHub private vulnerability reporting.
- 2026-10-21: Phase 0 task 3. `.github/workflows/quality.yml` (push to main, PRs, manual): lint + format check,
  typecheck for api and web (matrix), and API unit tests, all on Node 24 with `npm ci`. Vitest 5 + supertest
  in `app/api` (`npm test`, `npm run test:watch`; tests in `app/api/test/`, typechecked via `test/tsconfig.json`).
  18 tests, no database needed: pricing maths and its bug switches, the bug registry (isolation, TEST_HOOKS guard),
  and HTTP basics through `createApp()` (404 envelope, bad JSON, per-field validation, extended query parser,
  OpenAPI, hooks off/on). Removing the Express 4 compatibility settings fails 2 tests. Jobs run green in a clean
  copy locally; actionlint clean. Green on GitHub on draft PR #5 (run 39673500765): Gate 0 met.
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
| 1 | Rename repo to `playlab-platform` | Agreed (compose project and GitHub repo renamed) | 2026-10-21 |
| 2 | Tests in the same repo, one folder per suite | Open | |
| 3 | Second Playwright language: Java or Python | Open | |
| 4 | Go public at v1.0.0 | Open | |
| 5 | Pact files in repo before a broker | Open | |
| 6 | .NET suite | Open | |
| 7 | v2.0 FastAPI spec marked historical; PlayLab Pay (FastAPI) added as Phase 5 stretch | Agreed | 2026-10-21 |
| 8 | A9 reconciliation: build PLS-15.3 and 17.2; reword 13.x, 14.1, 16.1, 17.1 and 18.2 to match the build | Agreed | 2026-10-21 |

## Known issues

- `app/.env.example` hard-codes `PAYMENT_FRAME_URL=http://localhost:3000/pay/frame`.
  Changing `API_PORT` alone leaves the payment frame on the wrong port (404).
  Fix in Phase 0: remove the line and let `docker-compose.yml` derive it from `API_PORT`.
- `app/README.md` examples assume port 3000. The landing README uses the defaults and shows how to override them.
- Express 5's automatic `OPTIONS` reply is now `text/plain` with `Allow: GET, HEAD, POST`
  (it was `text/html` with `GET,HEAD,POST`). No AC or spec covers it.
- The latest CT package is 1.62.1. `@playwright/test` is at 1.64.1 (the version the plan cites) because the CT
  packages trail it. CT 1.62 bundles its own Vite 8, while the app still builds with Vite 5.4. Moving
  the app to Vite 8 is left to Dependabot or a later task.
- Lint gives 0 errors and 23 `no-explicit-any` warnings, all from untyped pg rows in the API.
  The rule is `warn` until row types are added.
- Not formatted by Prettier: Markdown (tables are aligned by hand), HTML (reflowing can change text tests assert on),
  `openapi/` and SQL migrations, and `tests/` (each suite brings its own setup).
- `multer` 1.4.5-lts.1 is deprecated with known vulnerabilities (fixed in 2.x). Expect a Dependabot major PR.

- GitHub private vulnerability reporting, which `SECURITY.md` points to, can't be enabled on a private repo.
  Turn it on when the repo goes public (Gate 3).
- `SECURITY.md` promises an acknowledgement within a week. Craig to confirm or change.
- Proposed plan change: Compose publishes ports 5173, 3000 and 5432 on all interfaces. Binding them to `127.0.0.1`
  would keep the stack off the local network. That changes how people reach the stack, so it needs agreeing first.

- The plan's edits to existing ACs (PLS-8.2, 8.3, 8.4 and 10.1 in "Changes to existing stories") are not
  applied yet. They describe Phase 1 behaviour, so they land with it; applying them now would make built
  ACs fail.
- Finding A7 confirmed on 2026-10-21: after a guest's 429, a request with a new `X-Forwarded-For` gets 200.
  The fix is in Phase 1 (trust only the web proxy; keep the bypass as the `rate-limit-bypass` defect).

## Local environment notes

- API on 3001 (`app/.env`): port 3000 is taken by the `open-webui` container.
