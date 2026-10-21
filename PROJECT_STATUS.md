# PlayLab Platform: Project Status

Plan: `docs/REVIEW_AND_PLAN.md`
Last updated: 2026-10-21

## Current phase

Phase 0: Foundations (branch `phase-0-foundations`)

## Next task

Phase 0, task 1: upgrade the api and web images and packages to Node 24 LTS and the
latest Playwright, and add a Dependabot config.

## Done

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

## Local environment notes

- API on 3001 (`app/.env`): port 3000 is taken by the `open-webui` container.
