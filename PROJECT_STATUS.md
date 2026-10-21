# PlayLab Platform: Project Status

Plan: `docs/REVIEW_AND_PLAN.md`
Last updated: 2026-10-21

## Current phase

Phase 0: Foundations (branch `phase-0-foundations`)

## Next task

Phase 0, task 2: add ESLint, Prettier, `lint-staged` and EditorConfig; remove `.DS_Store`.

## Done

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
- `multer` 1.4.5-lts.1 is deprecated with known vulnerabilities (fixed in 2.x). Expect a Dependabot major PR.

## Local environment notes

- API on 3001 (`app/.env`): port 3000 is taken by the `open-webui` container.
