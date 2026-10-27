# JMeter

The same load model as [`../k6/`](../k6/), run with JMeter: `.jmx` plans in git, non-GUI runs, shoppers read from a CSV, the token
read out of the login reply, and the HTML dashboard. Run them only against your own local stack.

| Plan | AC | What it does | Pass mark |
| --- | --- | --- | --- |
| `plans/products-load.jmx` (`run.sh products`) | 27.1 | `GET /products` at 50 requests a second for 5 minutes | p95 under 200 ms, errors under 1% |
| `plans/products-load.jmx` (`run.sh soak`) | 27.3 | the same plan at 25 a second for an hour | p95 in the last 5 minutes within 20% of the first 5, and the API's memory under its limit |
| `plans/checkout-journey.jmx` (`run.sh journey`) | 27.2 | each shopper logs in once, then adds to the cart and orders: 10 journeys a second for 5 minutes | `POST /orders` p95 under 800 ms, errors under 1% |
| `plans/overload.jmx` (`run.sh overload`) | 27.4 | 100 a second against a limit of 10 a second, then 2 a second | 429 with `Retry-After`, no errors or timeouts, back to 200 within a minute |

The rates, durations and pass marks come from [`../shared/load-model.json`](../shared/load-model.json), the file the k6 scripts read, and the
JUnit cases have the same names as k6's, so the two tools can be compared line by line.

## Run it

You need JMeter 5.6 (`brew install jmeter`, or set `JMETER=/path/to/bin/jmeter`) and Node.

```bash
cd app && docker compose -f docker-compose.yml -f docker-compose.perf.yml up --build -d && cd ..
curl -XPOST localhost:3000/test/reset          # a clean start (use your API_PORT)
tests/jmeter/run.sh products                    # 5 minutes
tests/jmeter/run.sh journey                     # 5 minutes
RPS=5 DURATION=30s tests/jmeter/run.sh products # a short try (an override is not evidence for an AC)
```

For `overload`, restart the API with a rate limit it can reach (the perf profile has none), as described in the
[k6 README](../k6/README.md#the-overload-test-needs-the-rate-limit).

`run.sh` makes the data (the catalogue, `data/users.csv`, `data/products.csv`) through the API's test hooks, runs JMeter without the GUI,
and turns the results into `results/junit-<plan>.xml`. It exits 1 if a pass mark is missed. Open `results/<plan>/dashboard/index.html` for
the dashboard: throughput, response times over time, percentiles.

## How the plans work

- **Rate.** A Precise Throughput Timer sets requests a second. In the checkout journey it sits on the cart request, so the rate is
  journeys a second, not requests.
- **Shoppers.** A CSV Data Set Config reads `data/users.csv` (email, password, token) made by `POST /test/users/bulk`. Each of the 100
  threads is a shopper: a Once Only Controller logs it in once, and it then orders over and over. (Logging in on every journey is a
  different test: bcrypt takes most of the API's two CPUs at 10 a second, and orders slow down for that reason. The k6 script skips the
  login by using the token from the CSV, so the two tools see the same load on the order path.)
- **Correlation.** A JSON Extractor reads `accessToken` from the login reply into a variable, and a Header Manager sends it as
  `Authorization: Bearer ...` on the cart and order requests. (The k6 script uses the token from the CSV directly.)
- **Overload.** Three thread groups start one after another with a startup delay: the overload, a minute of trickle, then the check that
  nothing is refused any more. A JSR223 assertion fails a 429 or 503 without a `Retry-After`.
- **Assertions.** Each sample checks its status code (200, or 201 for the cart and order).

## Files

| | |
| --- | --- |
| `plans/` | The `.jmx` files. Open them in the JMeter GUI to read or edit; run them with `run.sh`, not the GUI. |
| `lib/model.mjs` | Prints the `-J` properties for a plan from the load model |
| `lib/prepare-data.mjs` | Makes the catalogue, shoppers and products through the test hooks |
| `lib/jtl-to-junit.mjs` | Results file to JUnit: p95 and error rate for the label, the rate JMeter really sent, the soak's drift, the overload's refusals |
| `lib/soak-memory.mjs`, `lib/check-results.mjs` | The soak's memory check from Prometheus, and the exit code |
