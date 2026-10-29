# Exercises

Graded practice for each skill, on your own copy of the stack. Every exercise names the acceptance criteria it uses
(`docs/ACCEPTANCE_CRITERIA.md`), so you can check your work against the requirement, and the defects that prove your tests
work.

| Skill | File |
| --- | --- |
| Playwright (UI) | [playwright.md](playwright.md) |
| API testing (Postman, Karate, REST Assured) | [api-testing.md](api-testing.md) |
| Contract testing | [contract.md](contract.md) |
| API security | [security.md](security.md) |
| Performance (k6, JMeter) | [performance.md](performance.md) |
| CI/CD | [cicd.md](cicd.md) |

## How it works

1. **Beginner**: one behaviour, one test, with the data given.
2. **Intermediate**: several behaviours, your own test data, and a defect to catch.
3. **Advanced**: concurrency, design choices or tooling around the tests, with no hints.

Name every test after its AC ID (`PLS-5.2 expired code is rejected`). Read the base URLs from `app/.env`, never a hard-coded
port. Use `POST /test/users` and a test session for each test so tests can run in parallel.

**Prove it works.** A test that has never failed has not been shown to work. For each exercise, switch the named defect on
(`POST /test/bugs`) and check your test goes red, then switch it off and check it goes green.

Answers are in [`docs/answers/`](../answers/). They include the defect key, which spoils the hunt, so look only after you have
tried. The suites in `tests/` are one worked solution, not the only one.
