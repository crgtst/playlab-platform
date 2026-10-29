// The nightly defect sweep (PLS-29.3): switch defects on at random and check that the test suites notice.
//
//   node tools/nightly/defect-sweep.mjs [--count 10 | --all | --only name,name] [--seed 20261027] [--api http://localhost:3002]
//
// For each defect picked, every AC it names is run in the Playwright suite (and the security suite, for the defects it covers) with the
// defect forced on for each test (DEFECTS=name). The defect is caught if at least one of those tests fails. A defect no test fails for
// is missed, and the sweep exits 1: the suites would not notice that bug if it appeared.
//
// The seed picks the defects, so a failed night can be repeated: the same seed gives the same ones. It defaults to today's date.
// The tests that prove a defect ("defect <name> ...") switch it on themselves and are left out, as in the security suite's matrix.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const seed = Number(option('seed', process.env.SEED ?? today));
const all = argv.includes('--all');
const count = Number(option('count', process.env.COUNT ?? 10));
const api = option('api', process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '3000'}`);

/** mulberry32: the same generator the API's test-data hook uses, so a seed means the same everywhere. */
function rng(s) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const registry = (await (await fetch(`${api}/test/bugs`)).json()).data;
if (!Array.isArray(registry) || !registry.length)
  throw new Error(`GET ${api}/test/bugs returned no defects: is the stack up, with the test hooks on?`);

const random = rng(seed);
const shuffled = [...registry].sort((a, b) => a.name.localeCompare(b.name));
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const only = option('only', '')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean);
const unknown = only.filter((n) => !registry.some((d) => d.name === n));
if (unknown.length) throw new Error(`Unknown defect: ${unknown.join(', ')}`);
const picked = only.length
  ? registry.filter((d) => only.includes(d.name))
  : all
    ? registry
    : shuffled.slice(0, Math.min(count, registry.length));
console.log(`Sweeping ${picked.length} of ${registry.length} defects, seed ${seed}: ${picked.map((d) => d.name).join(', ')}\n`);

/** Runs the tests of one AC with the defect forced on. Returns how many ran and how many failed. */
function run(suite, ac, defect) {
  const res = spawnSync(
    'npx',
    ['playwright', 'test', '--grep', `${ac.replace('.', '\\.')}(?![0-9])`, '--grep-invert', 'defect ', '--reporter=json'],
    {
      cwd: path.join(root, 'tests', suite),
      env: { ...process.env, DEFECTS: defect, API_URL: api },
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    },
  );
  try {
    const { stats } = JSON.parse(res.stdout);
    return { ran: stats.expected + stats.unexpected + stats.flaky, failed: stats.unexpected + stats.flaky };
  } catch {
    return { ran: 0, failed: 0 };
  }
}

const rows = [];
for (const defect of picked) {
  const acs = defect.ac.split(',').map((a) => a.trim());
  const caught = [];
  let ran = 0;
  for (const suite of ['playwright-ts', 'security']) {
    for (const ac of acs) {
      const r = run(suite, ac, defect.name);
      ran += r.ran;
      if (r.failed) caught.push(`${suite}: ${ac} (${r.failed} of ${r.ran})`);
    }
    if (caught.length) break;
  }
  rows.push({ defect: defect.name, acs, side: defect.side, ran, caught });
  console.log(
    `${caught.length ? 'caught' : 'MISSED'}  ${defect.name.padEnd(30)} ${caught.length ? caught.join('; ') : `no test failed (${ran} ran for ${acs.join(', ')})`}`,
  );
}

const missed = rows.filter((r) => !r.caught.length);
const md = [
  `# Nightly defect sweep`,
  '',
  `Seed ${seed}. ${picked.length} of ${registry.length} defects, each switched on for the tests of its ACs; the defect is caught if a test fails.`,
  '',
  '| Defect | ACs | Caught by | Tests run |',
  '| --- | --- | --- | ---: |',
  ...rows.map((r) => `| \`${r.defect}\` | ${r.acs.join(', ')} | ${r.caught.length ? r.caught.join('; ') : '**MISSED**'} | ${r.ran} |`),
  '',
  missed.length
    ? `**${missed.length} missed:** ${missed.map((r) => r.defect).join(', ')}. Reproduce with \`node tools/nightly/defect-sweep.mjs --seed ${seed}\`.`
    : 'Every defect was caught.',
  '',
].join('\n');
fs.mkdirSync(path.join(root, 'tools/nightly/results'), { recursive: true });
fs.writeFileSync(path.join(root, 'tools/nightly/results/defect-sweep.md'), md);
console.log(`\n${rows.length - missed.length} of ${rows.length} caught. Written to tools/nightly/results/defect-sweep.md`);
process.exit(missed.length ? 1 : 0);
