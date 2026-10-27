# REST Assured

Maven and JUnit 5. Ten test classes, 112 tests, one per API area. Every test has its AC ID first in its `@DisplayName`
(`PLS-5.1 ...`) and as a `@Tag`, so the traceability report reads it from the JUnit XML and one test runs by its tag.
Only Java 17 or later is needed: the Maven wrapper in `tests/` fetches Maven.

Showcase: **20 threads order the last item at the same moment and exactly one succeeds** (`ConcurrencyTest`). With the
`stock-oversell` defect on, all 20 succeed and the test fails.

## Running it

Start the stack from `app/` (`docker compose up --build -d`), then, from `tests/`:

```bash
./mvnw -pl rest-assured test                                    # everything, four test classes at a time
./mvnw -pl rest-assured test -Dtest=OrdersTest                  # one class
./mvnw -pl rest-assured test -Dgroups=PLS-5.1                   # one test, by its AC tag
./mvnw -pl rest-assured test -Drestassured.env=ci               # another environment: local (default), ci, perf
./mvnw -pl rest-assured test -Ddefects=stock-oversell           # switch defects on (comma separated) in every session
```

The address is `http://localhost:<API_PORT from app/.env>`; set `BASE_URL` to override it. Results: `target/surefire-reports/`
(text and JUnit XML named by display name).

## Techniques

| Technique | Where |
| --- | --- |
| `RequestSpecBuilder`: base address, JSON, the test session header, log on failure only | `support/Api.java` |
| Response classes **generated from `app/api/openapi/openapi.yaml`** and read with `.as(Order.class)`, so a field the API adds or renames fails the build or the test | `pom.xml` (openapi-generator), used in most classes |
| A JSON Schema matcher over the shared `tests/shared/schemas/` | `support/Schema.java`: `body(Schema.matches("Cart"))` |
| A `ResponseSpecification` for the response-time budget | `ApiTest.FAST` |
| Data-driven tests: `@CsvFileSource` for 19 registration boundaries, `@MethodSource` and `@ValueSource` elsewhere | `RegistrationTest`, `StandardsTest`, `CartTest` |
| Concurrency with an `ExecutorService` and a latch that releases every request together | `ConcurrencyTest` |
| Parallel classes, each with its own test session and users | `junit-platform.properties` |
| Forged JWTs for the PLS-24.2 attacks | `support/Jwt.java` |

## What is where

| Path | What it holds |
| --- | --- |
| `src/test/java/ie/playlab/restassured/*Test.java` | `Auth`, `Registration`, `Catalogue`, `Cart`, `Orders`, `Lifecycle`, `Concurrency`, `Admin`, `Standards` |
| `ApiTest.java` | The base class: a session, an admin, order cleanup, and `placeOrder`, `addToCart`, `stock` |
| `src/test/java/ie/playlab/restassured/support/` | `Env`, `Shared` (the shared data), `Api` (sessions and specs), `Schema`, `Jwt`, `TestUser` |
| `target/generated-test-sources/openapi/` | The generated response classes (not committed; built by Maven) |
| `openapi-generator-ignore` | The one part of the API the generator cannot turn into classes that compile |

## Things that will catch you out

- **Test classes run in parallel, tests inside a class do not.** A class that checks stock has a product of its own
  (`OrdersTest` SP-007, `LifecycleTest` HK-007 and HK-006, `ConcurrencyTest` SP-002 and SP-003); orders a test places with
  `placeOrder` are cancelled afterwards, which puts the stock back. A shipped order cannot be cancelled, so
  `LifecycleTest` restores the stock of the one product it ships.
- **A throwaway product can appear while another class counts the catalogue** (CI is slower, so it shows there first).
  `AdminTest` names its products `zz ...`, which sorts last and never moves a seeded product between pages, and
  `CatalogueTest` asks that every seeded product is there once, not for an exact total.
- A subclass's `@AfterEach` runs **before** the base class's, so `ConcurrencyTest` cancels its orders itself before it
  restores the stock.
- REST Assured sends **no cookies** unless asked, so the `test_session` cookie never wins over the `X-Test-Session` header
  (it does in Karate).
- REST Assured's own schema matcher reads only draft-04 and the shared schemas are draft-07, so `Schema` uses the
  `networknt` validator, as the Karate suite does.
- `error.details` is a `oneOf` that the generator cannot turn into compiling classes, so the `Error` classes are not
  generated; error bodies are read with paths and `Schema.matches("Error")`.
- Surefire names tests in its XML by method name unless told to use display names; the POM does.

## Not done

- **Allure reports.** The JUnit XML feeds the traceability report; Allure needs its own agent and command-line tool.
