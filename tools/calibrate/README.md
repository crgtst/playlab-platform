# Calibrating the performance SLOs

The ACs in PLS-27 began with guesses: `GET /products` p95 under 200 ms, `POST /orders` under 800 ms. `calibrate.mjs` replaces them with
numbers measured on a real machine.

```bash
cd app && docker compose -f docker-compose.yml -f docker-compose.perf.yml up --build -d && cd ..
node tools/calibrate/calibrate.mjs 3 3m      # 3 runs of each test and tool, 3 minutes each (about 45 minutes)
```

For each request it runs the k6 script and the JMeter plan at the model's rate, reads the p95 and p99 each tool measured, and prints the
spread. The suggested limit is the **worst p95 seen, times 5, rounded up to 10 ms** (at least 20 ms):

- The factor of 5 leaves room for a machine slower than this one (a CI runner has fewer cores) and for noise between runs.
- It is still tight enough to fail a change that makes the API several times slower, which is what an SLO is for.
- JMeter's numbers count too: its threads and client add latency of their own, so a limit that suits k6 alone would fail JMeter.

`FACTOR=3 node tools/calibrate/calibrate.mjs` changes the factor. The numbers go to `tools/calibrate/results/calibration.json`.
A calibration is for one machine: run it again on a different one (or read the numbers from a CI run) before trusting the limits there.

## Capacity

The calibration measures latency at the AC rates. To find where the API gives out, run the stress script, which climbs in steps and prints
the p95 and error rate of each:

```bash
RATES=100,200,400,800,1600 STEP=1m tests/k6/run.sh stress
```

## After a calibration

Put the new limits in `tests/shared/load-model.json` (`products.p95Ms`, `orders.p95Ms`) and in the AC text of PLS-27.1 and 27.2. A unit test
(`app/api/test/shared-contract.test.ts`) fails if the two disagree.
