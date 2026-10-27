// Sends a JMeter run's results to Prometheus over remote write, so the Grafana dashboard can put JMeter next to k6. JMeter 5.6 has
// no Prometheus listener, so this reads the results file after the run and sends one sample every 5 seconds for each request name,
// with the same labels k6 uses (`tool`, `load`, `testid`, `name`).
//
//   node lib/push-metrics.mjs <load: products|orders|soak|overload> <testid> <results.jtl> <Prometheus base url>
//
// Series (all per request name):
//   jmeter_http_reqs_total, jmeter_http_req_failed_total   counters, like k6_http_reqs_total
//   jmeter_http_req_duration_avg / _p95 / _p99             gauges in seconds, like k6_http_req_duration_p95 (k6 sends seconds)
//
// The remote-write body is a hand-made protobuf in the snappy block format, with the snappy part stored uncompressed (a valid
// stream): the format is small enough that a library would be more code than this.
import fs from 'node:fs';

const [load, testid, jtl, prometheus] = process.argv.slice(2);
if (!prometheus) throw new Error('Usage: node push-metrics.mjs <load> <testid> <results.jtl> <Prometheus base url>');
const BUCKET_MS = 5000;

// ---- protobuf (just the three messages remote write needs)
const varint = (n) => {
  const out = [];
  let v = BigInt(n);
  while (v > 0x7fn) (out.push(Number(v & 0x7fn) | 0x80), (v >>= 7n));
  out.push(Number(v));
  return Buffer.from(out);
};
const field = (number, wireType, payload) => Buffer.concat([varint((number << 3) | wireType), payload]);
const bytesField = (number, buffer) => field(number, 2, Buffer.concat([varint(buffer.length), buffer]));
const text = (number, s) => bytesField(number, Buffer.from(s, 'utf8'));
const double = (n) => {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(n);
  return b;
};

function timeSeries(labels, samples) {
  const parts = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => bytesField(1, Buffer.concat([text(1, name), text(2, value)])));
  for (const [at, value] of samples) parts.push(bytesField(2, Buffer.concat([field(1, 1, double(value)), field(2, 0, varint(at))])));
  return bytesField(1, Buffer.concat(parts));
}

/** Snappy block format with every byte as a literal: the length, then literal runs of up to 65536 bytes. */
function snappyLiterals(data) {
  const chunks = [varint(data.length)];
  for (let i = 0; i < data.length; i += 65536) {
    const run = data.subarray(i, i + 65536);
    const lengthMinus1 = run.length - 1;
    chunks.push(Buffer.from([(61 << 2) | 0, lengthMinus1 & 0xff, (lengthMinus1 >> 8) & 0xff]), run);
  }
  return Buffer.concat(chunks);
}

// ---- the results file
function splitCsv(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cell += '"', i++);
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
const col = Object.fromEntries(splitCsv(lines[0]).map((name, i) => [name, i]));
const byLabel = new Map();
for (const line of lines.slice(1)) {
  const c = splitCsv(line);
  const label = c[col.label];
  if (!byLabel.has(label)) byLabel.set(label, []);
  byLabel.get(label).push({ at: Number(c[col.timeStamp]), ms: Number(c[col.elapsed]), failed: c[col.success] !== 'true' });
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)];
const series = [];
for (const [name, samples] of byLabel) {
  const buckets = new Map();
  for (const s of samples) {
    const key = Math.floor(s.at / BUCKET_MS) * BUCKET_MS + BUCKET_MS;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(s);
  }
  const times = [...buckets.keys()].sort((a, b) => a - b);
  const base = { tool: 'jmeter', load, testid, name };
  let total = 0;
  let failed = 0;
  const reqs = [];
  const fails = [];
  const avg = [];
  const p95 = [];
  const p99 = [];
  for (const t of times) {
    const list = buckets.get(t);
    const sorted = list.map((s) => s.ms / 1000).sort((a, b) => a - b);
    total += list.length;
    failed += list.filter((s) => s.failed).length;
    reqs.push([t, total]);
    fails.push([t, failed]);
    avg.push([t, sorted.reduce((a, b) => a + b, 0) / sorted.length]);
    p95.push([t, quantile(sorted, 0.95)]);
    p99.push([t, quantile(sorted, 0.99)]);
  }
  series.push(
    timeSeries({ ...base, __name__: 'jmeter_http_reqs_total' }, reqs),
    timeSeries({ ...base, __name__: 'jmeter_http_req_failed_total' }, fails),
    timeSeries({ ...base, __name__: 'jmeter_http_req_duration_avg' }, avg),
    timeSeries({ ...base, __name__: 'jmeter_http_req_duration_p95' }, p95),
    timeSeries({ ...base, __name__: 'jmeter_http_req_duration_p99' }, p99),
  );
}

const body = snappyLiterals(Buffer.concat(series));
const res = await fetch(`${prometheus.replace(/\/$/, '')}/api/v1/write`, {
  method: 'POST',
  headers: { 'Content-Encoding': 'snappy', 'Content-Type': 'application/x-protobuf', 'X-Prometheus-Remote-Write-Version': '0.1.0' },
  body,
});
if (res.status >= 300) throw new Error(`Prometheus said ${res.status}: ${await res.text()}`);
console.log(`Sent ${byLabel.size} request names (${series.length} series) to ${prometheus} as testid ${testid}`);
