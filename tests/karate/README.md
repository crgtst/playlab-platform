# Karate

Features per domain. Phase 2.

Planned techniques: `karate-config.js` environments, a `callonce` reset, fuzzy `match` against
[`../shared/schemas/`](../shared/schemas/), and the parallel runner.

Showcase: a Karate mock server standing in for the payment provider, plus one Gatling-backed load scenario reusing
the same features.

Can share a parent Maven POM with `rest-assured/` and `playwright-java/`, to keep the Java tooling in one place.
