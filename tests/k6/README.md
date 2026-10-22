# k6

Phase 3.

Planned techniques: smoke, load, stress, spike and soak scenarios with executors, checks and thresholds tied to SLOs,
`handleSummary` to JUnit and HTML, and Prometheus remote write.

Showcase: a threshold failing the build when `p(95)` latency on `GET /products` goes over the SLO with injected
latency (`POST /test/latency`).
