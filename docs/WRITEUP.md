# What I built, what bug mode taught me, and what I'd do on a real team

_Draft for Craig to edit: it is written in your voice from the project history. Change anything that isn't true to you._

## What I built

PlayLab Platform is a small online shop made to be tested. It has 47 planted defects that switch on with one HTTP call, 172
numbered acceptance criteria, and eight test suites (Playwright, Postman/Newman, Karate, REST Assured, contract, security, k6 and
JMeter) that all run in CI against the same Docker stack. A traceability report ties every acceptance criterion to the tests
that cover it, and a nightly job switches defects on at random and fails if no test notices.

I built it because practice sites let you write tests but never tell you whether those tests would catch anything. A test that
has never failed has not been shown to work.

## What bug mode taught me

- **Coverage is not detection.** Writing a test for an acceptance criterion felt like finishing. Switching its defect on showed
  how often the test still passed. The first traceability run found one defect (`logout-incomplete`) that no test caught.
- **Your own tests race.** Two Karate and REST Assured tests counted the catalogue while another created a throwaway product:
  41 products, not 40, one run in a few. The fix was not a retry. It was naming throwaway data so it could not move seeded
  data, and checking that every seeded product is present once.
- **A fuzzer finds what example tests don't.** Schemathesis found five real 500s in an API I thought was tidy: ids above
  2147483647, a null character in a query string, `{"refreshToken": {}}`, a malformed upload and a decimal id. Each became an
  acceptance criterion and a regression test.
- **Performance limits need measuring.** I first guessed 200 ms and 800 ms. Three runs on a real machine gave 12 ms and 15 ms
  at worst, so the limits became 60 ms and 80 ms, and a test that injects 100 ms now fails the run. The old limit would
  not have.
- **Load tests can be wrong too.** My JMeter journey logged in on every iteration, so bcrypt took most of the API's CPUs and
  failed an order SLO that k6 passed. The two tools only agreed once they put the same load on the same path.
- **Guards rot.** The release gate counted ranges of acceptance criteria and defects, and quietly started failing when Phase 3
  added more. A gate that is not itself tested drifts.
- **Process mistakes cost real time.** One `git add -A` committed 304 build files to `main`. Since then, commits name their
  paths.

## What I'd do on a real team

- Make "name the defect this test would catch" part of review for any new test, and keep a nightly sweep like this one so
  gaps show up within a day.
- Isolate tests by session and by data, never by running serially. Parallelism and speed come from that, not from more machines.
- Put contract checks (a breaking-change diff and consumer contracts) in front of every API change, and fuzz the API on a
  schedule.
- Treat performance numbers as measurements with a recorded method, not opinions, and re-measure when the hardware changes.
- Keep acceptance criteria numbered and traceable, so "what does this test protect?" always has an answer.

## What is not finished

The k6 and JMeter limits are calibrated on one machine, the soak test has run for three minutes and not an hour, and I have run
the stack only on macOS. Playwright in Java and Python, and a separate payment service, are planned but not in 1.0.0.
