# k6

Load tests for the API against the performance profile (PLS-27). Scripts are JavaScript; k6 itself runs in Docker, so nothing is
installed. Run them only against your own local stack.

| Script | AC | What it does | Pass mark |
| --- | --- | --- | --- |
| `smoke.js` | | One user, 30 seconds, the main read paths and a login | no failures, p95 under 500 ms |
| `products.js` | 27.1 | `GET /products` at 50 requests a second for 5 minutes | p95 under 200 ms, errors under 1% |
| `orders.js` | 27.2 | `POST /orders` at 10 a second for 5 minutes (a cart add, then the order) | p95 under 800 ms, errors under 1% |
| `soak.js` | 27.3 | `GET /products` at 25 a second for an hour | p95 in the last 5 minutes within 20% of the first 5, and the API's memory under its 1 GiB limit |
| `overload.js` | 27.4 | 100 a second against a limit of 10 a second, then a trickle | 429 with `Retry-After`, no errors or timeouts, back to 200 within a minute |
| `stress.js` | | The rate climbs in steps (50, 100, 200, 400, 800 a second) until it breaks | finds the limit; stops when over 20% fail |
| `spike.js` | | 20 a second, a 30-second surge to 300, 20 again | p95 back under the SLO after the spike |

The rates, durations and pass marks are in [`../shared/load-model.json`](../shared/load-model.json), which the
[JMeter plans](../jmeter/) read too, so the two tools run the same model and their numbers can be compared. They are the starting
figures in the ACs; calibrating them on a real machine is a later task.

## Run it

```bash
cd app && docker compose -f docker-compose.yml -f docker-compose.perf.yml up --build -d && cd ..
curl -XPOST localhost:3000/test/reset          # a clean start (use your API_PORT)
tests/k6/run.sh smoke
tests/k6/run.sh products                        # 5 minutes
tests/k6/run.sh orders                          # 5 minutes
```

`run.sh` finds the API port in `app/.env`, runs the script in the `grafana/k6` image, and exits 1 if any threshold or any extra check
failed. Results go to `tests/k6/results/`: `junit-<script>.xml` (every case is named after its AC, so the traceability report reads it),
`<script>-summary.json` and `<script>.html`.

A script sets up its own data through the test hooks: `POST /test/generate` for 10,000 products (a second run finds them there),
`POST /test/users/bulk` for 1,000 shoppers and their tokens, and 20 products of its own with a million in stock for the orders.

### Short runs

`RPS` and `DURATION` override the model, to try a script quickly (`RPS=10 DURATION=20s tests/k6/run.sh products`). A run with an override
is not evidence for an AC. `soak.js` also takes `BASELINE_WINDOW`; a short soak uses a quarter of its length per window.

### The overload test needs the rate limit

The perf profile switches the rate limit off, and an API with no limit cannot say 429. For `overload.js`, restart the API with one the
script can reach, and put it back afterwards:

```bash
cd app
PERF_RATE_LIMIT_PER_MIN=600 docker compose -f docker-compose.yml -f docker-compose.perf.yml up -d api
cd .. && tests/k6/run.sh overload
cd app && docker compose -f docker-compose.yml -f docker-compose.perf.yml up -d api
```

### A threshold failing the build

```bash
INJECT_LATENCY_MS=300 tests/k6/run.sh products
```

adds 300 ms to every `GET /products` with `POST /test/latency`, and the p95 threshold fails, so the run exits 1:

```
FAIL PLS-27.1 latency of GET /products at 50/s: p(95)<200
```

The script removes the latency when it ends.

### Metrics in Grafana

`PROMETHEUS_RW=1 tests/k6/run.sh spike` also sends k6's metrics (`k6_http_req_duration_p95` and so on) to the stack's Prometheus
over remote write, tagged with a `testid`. The perf profile's Prometheus accepts them; a dashboard that compares k6 and JMeter is a later task.

## Files

| | |
| --- | --- |
| `scripts/` | One file for each row above. Each has a short comment saying what it proves. |
| `lib/config.js` | The base URL (from `run.sh`), the model, and the overrides |
| `lib/data.js` | Data through the test hooks: catalogue, shoppers, the run's own products, injected latency |
| `lib/summary.js` | `handleSummary`: JUnit, JSON and HTML. Every threshold becomes a case named `PLS-27.n <what>: <threshold>` |
| `lib/soak-memory.mjs` | After a soak, asks Prometheus for the API's highest memory and adds a case to the JUnit file |
| `lib/check-results.mjs` | Fails the run for any failed case, including the ones k6 has no threshold for (the soak's drift) |
