# Contributing

Thanks for looking. PlayLab Platform is a training app, so contributions are welcome in three shapes: a bug in the platform,
a better exercise, or a new defect worth catching.

## Before you start

- Read the [README](README.md) and run the stack once. Keep it **local**: see [SECURITY.md](SECURITY.md).
- The behaviour lives in [`docs/SPEC.md`](docs/SPEC.md) and [`docs/ACCEPTANCE_CRITERIA.md`](docs/ACCEPTANCE_CRITERIA.md).
  The plan is in [`docs/REVIEW_AND_PLAN.md`](docs/REVIEW_AND_PLAN.md). For anything bigger than a fix, open an issue first.

## The rules

1. **Every new behaviour gets an AC ID** in `docs/ACCEPTANCE_CRITERIA.md`, and every new defect maps to an AC.
2. **Never change behaviour covered by an AC** without changing the AC in the same pull request and saying why.
3. **All defects keep working.** `app/api/test/bugs.test.ts` fails if a defect is in no test; the nightly run fails if a
   defect is missed.
4. **Test names start with the AC ID** (`PLS-5.2 expired code is rejected`). `npm run traceability:sources` fails a pull request that names an AC
   that does not exist.
5. **No hard-coded ports.** Read `API_PORT` and `WEB_PORT`.
6. Conventional commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `test:`.

## Checks to run first

```bash
npm install
npm run lint && npm run format:check
cd app/api && npm ci && npm test          # unit tests, no database
cd app/api && npm run test:int            # integration tests, needs the db container
cd app && docker compose up --build -d    # then: cd e2e && npm ci && npm test
```

After any change, check the shop still sells: log in as `customer@playlab.test` / `Password123!`, buy a product with card
`4242 4242 4242 4242` and reach the order confirmation.

## Adding a defect

1. Add it to `BUGS` in `app/api/src/lib/bugs.ts` with its AC, side and description.
2. Make it change only its own behaviour, and only when switched on.
3. Add an integration test showing the AC failing with the defect on and passing with it off.
4. Add it to the defect table in `app/README.md` and to `docs/answers/`.

## Adding an exercise

Put it in `docs/exercises/<skill>.md` at the right level (beginner, intermediate or advanced), say what the learner should
produce and how they will know it works, and put the solution in `docs/answers/<skill>.md`.

## Reporting a problem

Use the issue templates. For a security problem in the platform itself (for example the production guard or the test-hook
guard failing), follow [SECURITY.md](SECURITY.md). Planted defects are not vulnerabilities.
