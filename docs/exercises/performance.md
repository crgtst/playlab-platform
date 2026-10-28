# Performance exercises (k6 and JMeter)

Use the performance profile: `docker compose -f docker-compose.yml -f docker-compose.perf.yml up --build -d` (production mode, no
rate limit, fixed CPU and memory limits, Prometheus and Grafana). Never judge numbers from the normal development stack.

## Beginner

1. **Smoke** (PLS-27.5). Run a one-iteration script against `GET /products` and check the response. Open the Grafana "PlayLab API"
   dashboard and find your request.
2. **A threshold** (PLS-27.1). Fail the run if the 95th percentile of `GET /products` goes over a limit you choose. Prove it by
   injecting latency with `POST /test/latency`.

## Intermediate

3. **Data first** (PLS-28.3, PLS-28.4). Generate 10,000 products and 1,000 shoppers with `POST /test/generate` and
   `POST /test/users/bulk`, and use the CSV in your plan.
4. **A journey** (PLS-27.2). Log in once per shopper, browse, add to the cart and order, at 10 orders a second. Use the access
   token from the login (correlation).
5. **Same load, two tools.** Build the same journey in k6 and in JMeter from `tests/shared/load-model.json`, and compare the two
   on one Grafana dashboard.
6. **Calibrate** (PLS-27.1 to 27.4). Run three times, take the worst 95th percentile, add a margin, and write down the number and
   how you got it. A limit nobody measured is a guess.

## Advanced

7. **Find the edge.** Step the rate up until the 95th percentile climbs. Where is the knee, and what is queueing?
8. **Overload and recovery** (PLS-27.4). At ten times the rate limit, requests must be refused with 429 and `Retry-After`, with no
   errors, and the API must recover within a minute.
9. **Soak** (PLS-27.3). Run for an hour, and compare the first and last windows for drift and memory.
