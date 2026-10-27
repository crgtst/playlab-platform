// Turns a JMeter results file (.jtl, CSV) into JUnit cases named after the ACs, with the same pass marks and wording as the k6 suite,
// so the traceability report reads both and the two tools can be compared line by line.
//
//   node lib/jtl-to-junit.mjs <products|journey|soak|overload> <results.jtl> <junit.xml>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { propertiesFor, seconds } from './model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(fs.readFileSync(path.join(here, '../../shared/load-model.json'), 'utf8'));
const [plan, jtl, out] = process.argv.slice(2);

/** One CSV line, honouring quotes (a failure message can hold commas). */
function splitCsv(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (cells.push(cell), (cell = ''));
    else cell += c;
  }
  cells.push(cell);
  return cells;
}

const lines = fs.readFileSync(jtl, 'utf8').split(/\r?\n/).filter(Boolean);
const header = splitCsv(lines[0]);
const col = Object.fromEntries(header.map((name, i) => [name, i]));
const samples = lines.slice(1).map((line) => {
  const c = splitCsv(line);
  return {
    at: Number(c[col.timeStamp]),
    ms: Number(c[col.elapsed]),
    label: c[col.label],
    code: c[col.responseCode],
    ok: c[col.success] === 'true',
    message: c[col.failureMessage] || '',
  };
});
if (!samples.length) throw new Error(`${jtl} has no samples: the run did not get as far as sending requests`);

const p95 = (list) => {
  const sorted = list.map((s) => s.ms).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : NaN;
};
const where = (label) => samples.filter((s) => s.label === label);
const errorRate = (list) => (list.length ? list.filter((s) => !s.ok).length / list.length : 1);
const props = propertiesFor(plan);
const first = Math.min(...samples.map((s) => s.at));
const last = Math.max(...samples.map((s) => s.at));
const cases = [];
const check = (name, ok, message) => cases.push({ name, ok, message: message ?? 'not met' });

/** Latency, errors and whether JMeter really sent the rate it was asked for (k6's dropped iterations). */
function rateChecks(ac, label, title, rps, p95Ms, maxErrorRate) {
  const list = where(label);
  // The shoppers start over `ramp` seconds, so the rate is measured after that.
  const rampMs = Number(props.ramp ?? 0) * 1000;
  const steady = list.filter((s) => s.at - first >= rampMs);
  const seconds = Math.max(1, (last - first - rampMs) / 1000);
  check(`${ac} latency of ${title} at ${rps}/s: p(95)<${p95Ms}`, p95(list) < p95Ms, `p95 was ${p95(list)} ms`);
  check(`${ac} error rate of ${title}: rate<${maxErrorRate}`, errorRate(list) < maxErrorRate, `error rate was ${(errorRate(list) * 100).toFixed(2)}%`);
  check(`${ac} requests sent are at least 95% of the ${rps}/s asked for${rampMs ? ' (after the ramp-up)' : ''}`, steady.length / seconds >= 0.95 * Number(rps), `sent ${(steady.length / seconds).toFixed(1)}/s`);
}

if (plan === 'products') {
  const m = model.products;
  rateChecks(m.ac, 'GET /products', m.title, props.rps, m.p95Ms, m.maxErrorRate);
} else if (plan === 'journey') {
  const m = model.orders;
  rateChecks(m.ac, 'POST /orders', m.title, props.rps, m.p95Ms, m.maxErrorRate);
  for (const label of ['POST /auth/login', 'POST /cart/items']) {
    check(`${m.ac} error rate of ${label}: rate<${m.maxErrorRate}`, errorRate(where(label)) < m.maxErrorRate, `error rate was ${(errorRate(where(label)) * 100).toFixed(2)}%`);
  }
} else if (plan === 'soak') {
  const m = model.soak;
  const total = Math.floor((last - first) / 1000);
  const windowSeconds = Math.min(seconds(process.env.BASELINE_WINDOW || m.baselineWindow), Math.floor(total / 4));
  const list = where('GET /products');
  const early = list.filter((s) => s.at - first < windowSeconds * 1000);
  const late = list.filter((s) => last - s.at < windowSeconds * 1000);
  const drift = ((p95(late) - p95(early)) / p95(early)) * 100;
  check(`${m.ac} error rate over the soak: rate<0.01`, errorRate(list) < 0.01, `error rate was ${(errorRate(list) * 100).toFixed(2)}%`);
  check(
    `${m.ac} p95 in the last ${windowSeconds}s is within ${m.maxDriftPercent}% of the first ${windowSeconds}s (first ${p95(early)} ms, last ${p95(late)} ms, ${drift.toFixed(1)}%)`,
    drift <= m.maxDriftPercent,
    `p95 drifted ${drift.toFixed(1)}%`,
  );
} else if (plan === 'overload') {
  const m = model.overload;
  const during = where('GET /products (overload)');
  const refused = during.filter((s) => s.code === '429' || s.code === '503');
  const unexpected = during.filter((s) => !['200', '429', '503'].includes(s.code));
  check(`${m.ac} requests refused with 429 or 503: count>0`, refused.length > 0, 'nothing was refused: the load did not reach the limit (start the API with PERF_RATE_LIMIT_PER_MIN=600)');
  check(`${m.ac} share of responses that were not 200, 429 or 503 (errors and timeouts): rate==0`, unexpected.length === 0, `${unexpected.length} were`);
  check(`${m.ac} share of refusals with a Retry-After header: rate==1`, !during.some((s) => /Retry-After/.test(s.message)), 'a refusal had no Retry-After');
  check(`${m.ac} latency while overloaded (a refusal is quick): p(99)<1000`, Math.max(...during.map((s) => s.ms)) < 1000 || p99(during) < 1000, `p99 was ${p99(during)} ms`);
  const recovered = where('GET /products (recovered)');
  check(`${m.ac} failures after the minute of recovery: rate==0`, recovered.length > 0 && errorRate(recovered) === 0, `${recovered.filter((s) => !s.ok).length} of ${recovered.length} failed`);
  check(`${m.ac} latency after the minute of recovery: p(95)<500`, p95(recovered) < 500, `p95 was ${p95(recovered)} ms`);
}

function p99(list) {
  const sorted = list.map((s) => s.ms).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1)] : NaN;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const failed = cases.filter((c) => !c.ok).length;
const suite = `JMeter ${plan}`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="${suite}" tests="${cases.length}" failures="${failed}">`,
    `<testsuite name="${suite}" tests="${cases.length}" failures="${failed}">`,
    ...cases.map((c) =>
      c.ok
        ? `<testcase classname="${suite}" name="${esc(c.name)}"/>`
        : `<testcase classname="${suite}" name="${esc(c.name)}"><failure message="${esc(c.message)}"/></testcase>`,
    ),
    '</testsuite>',
    '</testsuites>',
    '',
  ].join('\n'),
);
for (const c of cases) console.log(`${c.ok ? 'pass' : 'FAIL'}  ${c.name}${c.ok ? '' : `: ${c.message}`}`);
