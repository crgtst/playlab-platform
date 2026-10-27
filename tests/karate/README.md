# Karate

Seven feature files, one per API area, run in parallel by one JUnit 5 runner. Every scenario name starts with its AC ID
(`PLS-5.1 ...`, also tagged `@PLS-5.1`), so the traceability report picks them up and one scenario runs by its tag.
Only Java 17 or later is needed: the Maven wrapper in `tests/` fetches Maven.

Showcase: a **20-customer race for the last item** (and a single-use code, and paying twice) through a small Java helper,
and a **data-driven registration outline** that reads its rows from a CSV. Karate also uploads a real PNG, which a Postman
script cannot.

## Running it

Start the stack from `app/` (`docker compose up --build -d`), then, from `tests/`:

```bash
./mvnw -pl karate test                                       # every feature, 4 threads
./mvnw -pl karate test -Dkarate.options="--tags @PLS-5.1"    # one scenario, by AC tag
./mvnw -pl karate test -Dkarate.options="classpath:features/orders.feature"
./mvnw -pl karate test -Dkarate.env=ci                       # another environment: local (default), ci, perf
./mvnw -pl karate test -Ddefects=lost-update                 # switch defects on (comma separated) for the whole run
./mvnw -pl karate test -Dthreads=1                           # run one scenario at a time
```

The address is `http://localhost:<API_PORT from app/.env>`; set `BASE_URL` to override it. Reports are in
`karate/target/karate-reports/`: `karate-summary.html` for people, and one JUnit XML file per feature for the
traceability report.

## What is where

| Path | What it holds |
| --- | --- |
| `src/test/resources/features/*.feature` | The features: `auth`, `registration`, `catalogue`, `cart`, `orders`, `admin`, `standards` |
| `src/test/resources/common/*.feature` | Called steps (`@ignore`): `session`, `user`, `login`, `add-to-cart`, `place-order`, `cancel-order`, and so on |
| `src/test/resources/karate-config.js` | The address, the environments, and helpers every feature can call (`productId`, `orderBody`, ...) |
| `src/test/resources/data/` | The data-driven rows (`registration-boundaries.csv`) |
| `src/test/java/playlab/KarateRunner.java` | The parallel runner |
| `src/test/java/playlab/Schemas.java` | Checks a response against `tests/shared/schemas/` (`match Schemas.check('ProductList', response) == []`) |
| `src/test/java/playlab/Race.java`, `Jwt.java` | Simultaneous requests and fast repeated GETs; forged tokens for the PLS-24.2 attacks |

## Things that will catch you out

- **Scenarios run in parallel**, not only features. A scenario that checks stock uses a product of its own (`SP-006`,
  `HK-008`, `SP-004`), and any order it places is cancelled in `afterScenario`, which puts the stock back.
- **`configure headers` beats a per-request `header`** and is inherited by called features. The feature's own session
  is set that way, so a step that supplies another session starts with `* configure headers = null` (every file in
  `common/` does).
- **Karate's HTTP client keeps the `test_session` cookie** the API sets, and the cookie wins over the header. Sessions
  are made through `Race.createSession`, not an HTTP step, so there is no cookie.
- `match` splits a line at its first `==`, including one inside a function: put the filter in a `def`, then match on it.
- `status` takes a number, not an expression: `Then match responseStatus == parseInt(status)` in an outline.
- The Java HTTP client offers an upgrade to HTTP/2, which the API's WebSocket handler answers with a 404: `Race` uses
  HTTP/1.1.

## Not done

- The Karate **mock server standing in for the payment provider**: the shop's provider is part of the Express API, so
  there is nothing to swap out. It becomes useful with PlayLab Pay (Phase 5).
- The **Gatling-backed load scenario** that reuses these features: Phase 3, with the performance work.
