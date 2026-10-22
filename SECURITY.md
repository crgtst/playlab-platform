# Security policy

PlayLab Platform is a **deliberately defective training app**. It exists so testers can practise finding bugs,
including security bugs, on their own machine. It is not, and will never be, safe to deploy.

## Use it locally only

- Run it on your own computer with `docker compose`. Do not deploy it to a server, a cloud account or a shared
  environment, and never put real personal data, passwords or card numbers into it.
- Docker publishes the web (5173), API (3000) and database (5432) ports on **every network interface**, so other devices
  on the same network can reach them. Don't run the stack on an untrusted network, such as public Wi-Fi, or block those
  ports with your firewall.
- Stop and wipe it with `docker compose down -v` when you're done.

## What is insecure on purpose

None of the following should be reported as a vulnerability:

- **Bug mode.** Named defects that can be switched on with `POST /test/bugs`, some of them security defects (for example
  broken access control or trusting client-supplied prices). They are the point of the app.
- **Test hooks under `/test/*`.** They are unauthenticated and can reset the database, create users of any role
  (including admin) and return their tokens, move the server clock, inject failures, and read every email the app
  "sent", including password-reset links. `docker-compose.yml` turns them on by default.
- **Development defaults.** A fixed `JWT_SECRET`, the Postgres credentials `playlab` / `playlab`, plain HTTP, and
  seeded accounts with a published password.

## The guard that exists today

Start the stack with `TEST_HOOKS=false` and:

- every `/test/*` path returns `404`, and the latency and chaos middleware is not mounted;
- every bug-mode defect is off, even if it was switched on before, and the web app receives an empty defect list.

This guard is covered by the API unit tests in [`app/api/test/`](app/api/test/). It switches off the training features;
it does **not** make the app safe to deploy. The development defaults above still apply.

A stronger guard is planned: refusing to start with test hooks or defects enabled when `NODE_ENV=production`, unless
explicitly overridden (finding R3 in [`docs/REVIEW_AND_PLAN.md`](docs/REVIEW_AND_PLAN.md)).

## What to report

Please report anything that could harm someone using PlayLab as intended, on their own machine. For example:

- a defect or test hook that is active even with `TEST_HOOKS=false`;
- anything that lets the stack reach beyond its own containers, such as reading host files or running commands on the
  host;
- a real secret or personal data committed to the repository;
- a vulnerable dependency, base image or GitHub Actions workflow that affects people running or contributing to the
  project;
- a malicious or compromised package in the dependency tree.

## How to report

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a
vulnerability**. Please don't open a public issue for a real vulnerability.

Include what you found, how to reproduce it, and which commit or version you tested. This is a personal project, so
fixes are best effort; you should get an acknowledgement within a week.

## Supported versions

Only the latest commit on `main` is supported. There are no backported fixes.
