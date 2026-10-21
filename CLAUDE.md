# PlayLab Platform: instructions for AI assistants

PlayLab Platform is a local, Dockerised e-commerce app built to practise testing with
Playwright, Postman/Newman, Karate, REST Assured, k6, JMeter, contract testing,
API security testing and CI/CD. The app exists to be tested.

## Source of truth

- Plan: `docs/REVIEW_AND_PLAN.md` (phases, findings, API additions, AC changes).
- Behaviour: `tests/SPEC.md` and `tests/ACCEPTANCE_CRITERIA.md` (moving to `docs/` in Phase 0).
- Progress: `PROJECT_STATUS.md`.
- Follow the plan. If something in it looks wrong, propose a change to the plan instead of deviating.

## How to work

- One phase, one task at a time. Stop and summarise after each task.
- Never change behaviour covered by an existing AC unless the plan says so.
  All existing ACs and bug-mode defects must keep working.
- Every new behaviour gets an AC ID. Every new defect maps to an AC.
- Do not write the test suites under `tests/` (Playwright, Postman, Karate, REST Assured,
  k6, JMeter). Those are Craig's training. Platform code, CI and docs only, unless asked.
- Update `PROJECT_STATUS.md` at the end of every task. One commit per task, with a
  conventional message (`feat:`, `fix:`, `chore:`, `docs:`).

## Running the stack

- From `app/`: `docker compose up --build -d`; stop and wipe with `docker compose down -v`.
- Ports come from `app/.env`. On Craig's machine the API runs on 3001, because port 3000
  is used by another container. Never hard-code 3000; read `API_PORT` or a base-URL variable.
- Ready when `GET http://localhost:${API_PORT}/api/v1/health` returns 200 with every check `up`.
- After any change, smoke-test checkout: log in as `customer@playlab.test` / `Password123!`,
  buy any product with card `4242 4242 4242 4242`, and reach the order confirmation.
