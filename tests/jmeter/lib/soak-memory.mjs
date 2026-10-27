// PLS-27.3, second half: the API stays inside its memory limit. Asks Prometheus for the API's highest resident memory during the
// soak and adds a case to tests/jmeter/results/junit-soak.xml.
//
//   PROMETHEUS_URL=http://localhost:9091 node lib/soak-memory.mjs <start epoch seconds> <end epoch seconds>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(fs.readFileSync(path.join(here, '../../shared/load-model.json'), 'utf8'));
const [start, end] = process.argv.slice(2).map(Number);
const limit = model.soak.memoryLimitBytes;
const junit = path.join(here, '../results/junit-soak.xml');

let name;
let ok = false;
let message = '';
try {
  const seconds = Math.max(60, end - start);
  const query = `max_over_time(process_resident_memory_bytes{job="playlab-api"}[${seconds}s])`;
  const res = await fetch(`${process.env.PROMETHEUS_URL ?? 'http://localhost:9091'}/api/v1/query?query=${encodeURIComponent(query)}&time=${end}`);
  const result = (await res.json()).data.result;
  if (!result.length) throw new Error('Prometheus has no process_resident_memory_bytes for the API');
  const peak = Number(result[0].value[1]);
  ok = peak < limit;
  name = `PLS-27.3 the API's memory peaked at ${(peak / 1048576).toFixed(0)} MiB, under its ${(limit / 1048576).toFixed(0)} MiB limit`;
  message = `peak ${(peak / 1048576).toFixed(0)} MiB is over the ${(limit / 1048576).toFixed(0)} MiB limit`;
} catch (error) {
  name = 'PLS-27.3 the API stays within its memory limit';
  message = `could not read the API's memory from Prometheus: ${error.message}`;
}

const xml = fs.readFileSync(junit, 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const testcase = ok
  ? `<testcase classname="JMeter soak" name="${esc(name)}"/>`
  : `<testcase classname="JMeter soak" name="${esc(name)}"><failure message="${esc(message)}"/></testcase>`;
const updated = xml
  .replace('</testsuite>', `${testcase}\n</testsuite>`)
  .replace(/tests="(\d+)"/g, (_, n) => `tests="${Number(n) + 1}"`)
  .replace(/failures="(\d+)"/g, (_, n) => `failures="${Number(n) + (ok ? 0 : 1)}"`);
fs.writeFileSync(junit, updated);
console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok ? '' : `: ${message}`}`);
