# REST Assured

Maven and JUnit 5. Phase 2.

Planned techniques: `RequestSpecBuilder`, POJOs generated from `app/api/openapi/openapi.yaml`, the JSON Schema
validator against [`../shared/schemas/`](../shared/schemas/), and Allure reports.

Showcase: a concurrency test where 20 threads buy the last item and exactly one succeeds; the `stock-oversell`
defect makes it fail.

Can share a parent Maven POM with `karate/` and `playwright-java/`.
