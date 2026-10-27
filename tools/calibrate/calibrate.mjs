// Calibrates the performance SLOs on the machine it runs on (Phase 3 task 14).
//
// The ACs started with guesses (GET /products p95 under 200 ms, POST /orders under 800 ms). This runs each load test with k6 and with
// JMeter a few times at the model's rates, reads the p95 and p99 each tool measured, and suggests a limit: the worst p95 seen, times a
// safety factor, rounded up. The factor leaves room for a slower machine (a CI runner) and for noise, while still failing a change that
// makes the API several times slower.
//
//   node tools/calibrate/calibrate.mjs [runs=3] [duration=3m]       (the perf stack must be up: see tests/k6/README.md)
//
// Writes tools/calibrate/results/calibration.json and prints a table.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [runs = '3', duration = '3m'] = process.argv.slice(2);
const FACTOR = Number(process.env.FACTOR ?? 5);
const model = JSON.parse(fs.readFileSync(path.join(root, 'tests/shared/load-model.json'), 'utf8'));

const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)];
};

/** p95 and p99 in ms of one label in a JMeter results file. */
function jmeterLatency(jtl, label) {
  const lines = fs.readFileSync(jtl, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',');
  const at = header.indexOf('elapsed');
  const l = header.indexOf('label');
  const times = lines
    .slice(1)
    .map((line) => line.split(','))
    .filter((cells) => cells[l] === label)
    .map((cells) => Number(cells[at]));
  return { p95: quantile(times, 0.95), p99: quantile(times, 0.99), requests: times.length };
}

function k6Latency(summaryFile, metric) {
  const values = JSON.parse(fs.readFileSync(summaryFile, 'utf8')).metrics[metric].values;
  return { p95: values['p(95)'], p99: values['p(99)'] };
}

const cases = [
  {
    name: 'GET /products',
    ac: model.products.ac,
    limit: model.products.p95Ms,
    k6: ['products', 'http_req_duration{endpoint:products}'],
    jmeter: ['products', 'GET /products'],
  },
  {
    name: 'POST /orders',
    ac: model.orders.ac,
    limit: model.orders.p95Ms,
    k6: ['orders', 'http_req_duration{endpoint:orders}'],
    jmeter: ['journey', 'POST /orders'],
  },
];

const results = [];
for (let run = 1; run <= Number(runs); run++) {
  for (const c of cases) {
    for (const tool of ['k6', 'jmeter']) {
      const [script, what] = c[tool];
      console.log(`\n== run ${run} of ${runs}: ${tool} ${c.name} (${duration})`);
      const res = spawnSync(path.join(root, 'tests', tool === 'k6' ? 'k6' : 'jmeter', 'run.sh'), [script], {
        cwd: root,
        env: { ...process.env, DURATION: duration },
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      const latency =
        tool === 'k6'
          ? k6Latency(path.join(root, 'tests/k6/results', `${script}-summary.json`), what)
          : jmeterLatency(path.join(root, 'tests/jmeter/results', script, 'results.jtl'), what);
      results.push({ run, tool, request: c.name, ac: c.ac, exit: res.status, ...latency });
      console.log(`   p95 ${latency.p95.toFixed(1)} ms, p99 ${latency.p99.toFixed(1)} ms`);
    }
  }
}

const summary = cases.map((c) => {
  const rows = results.filter((r) => r.request === c.name);
  const worstP95 = Math.max(...rows.map((r) => r.p95));
  const suggested = Math.max(20, Math.ceil((worstP95 * FACTOR) / 10) * 10);
  const byTool = Object.fromEntries(
    ['k6', 'jmeter'].map((tool) => {
      const p95s = rows.filter((r) => r.tool === tool).map((r) => r.p95);
      return [
        tool,
        { min: Math.min(...p95s), max: Math.max(...p95s), p99worst: Math.max(...rows.filter((r) => r.tool === tool).map((r) => r.p99)) },
      ];
    }),
  );
  return { request: c.name, ac: c.ac, startingLimitMs: c.limit, worstP95Ms: worstP95, factor: FACTOR, suggestedLimitMs: suggested, byTool };
});

fs.mkdirSync(path.join(root, 'tools/calibrate/results'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'tools/calibrate/results/calibration.json'),
  JSON.stringify({ at: new Date().toISOString(), runs: Number(runs), duration, results, summary }, null, 2),
);

console.log('\nRequest        p95 k6 (min-max)   p95 JMeter (min-max)   worst p95   x' + FACTOR + ' = suggested   (was)');
for (const s of summary) {
  const f = (t) => `${s.byTool[t].min.toFixed(1)}-${s.byTool[t].max.toFixed(1)} ms`;
  console.log(
    `${s.request.padEnd(14)} ${f('k6').padEnd(18)} ${f('jmeter').padEnd(22)} ${s.worstP95Ms.toFixed(1).padStart(6)} ms   ${String(s.suggestedLimitMs).padStart(5)} ms        (${s.startingLimitMs} ms)`,
  );
}
process.exit(results.some((r) => r.exit !== 0) ? 1 : 0);
