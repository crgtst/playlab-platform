// The defect matrix: runs the collections once per API-side defect, with only that defect switched on, and writes
// results/defect-matrix.md showing which collections and tests went red. A defect nothing catches is a gap.
//   node defects.mjs                  every API-side defect
//   node defects.mjs lost-update      just these
// It resets the stack (POST /test/reset) before each run, so do not run it while anything else is using the stack.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = readFileSync(join(here, '..', '..', 'app', '.env'), 'utf8').match(/^API_PORT=(\d+)/m)?.[1];
const base = process.env.BASE_URL ?? `http://localhost:${port}`;

const source = readFileSync(join(here, '..', '..', 'app', 'api', 'src', 'lib', 'bugs.ts'), 'utf8');
const defects = [...source.slice(source.indexOf('export const BUGS')).matchAll(/^ {2}'([a-z0-9-]+)': \{[^}]*?side: '([^']+)'/gms)].map((m) => ({ name: m[1], side: m[2] }));
const wanted = process.argv.slice(2);
const chosen = defects.filter((d) => (wanted.length ? wanted.includes(d.name) : d.side.includes('api')));

const rows = [];
for (const defect of chosen) {
  await fetch(`${base}/test/reset`, { method: 'POST' });
  const run = spawnSync('node', [join(here, 'run.mjs'), '--defect', defect.name], { encoding: 'utf8', env: process.env });
  const failed = (run.stdout.match(/^FAILED .+$/gm) ?? []).map((line) => line.replace('FAILED ', '').split(' :: '));
  const byCollection = new Map();
  for (const [collection, test] of failed) byCollection.set(collection, [...(byCollection.get(collection) ?? []), test]);
  rows.push({ ...defect, failed, byCollection });
  console.log(`${defect.name.padEnd(30)} ${failed.length ? `${failed.length} failed in ${[...byCollection.keys()].join(', ')}` : 'NOT CAUGHT'}`);
}
await fetch(`${base}/test/reset`, { method: 'POST' });

const lines = [
  '# Postman defect matrix',
  '',
  'Each defect switched on alone, for one session. "Caught by" is the collections with a failing test, and the first failing test.',
  '',
  '| Defect | Side | Caught by | First failing test |',
  '| --- | --- | --- | --- |',
  ...rows.map((r) => `| \`${r.name}\` | ${r.side} | ${r.failed.length ? [...r.byCollection.keys()].join(', ') : '**not caught**'} | ${r.failed[0]?.[1] ?? ''} |`),
  '',
  `${rows.filter((r) => r.failed.length).length} of ${rows.length} caught.`,
  '',
];
mkdirSync(join(here, 'results'), { recursive: true });
writeFileSync(join(here, 'results', 'defect-matrix.md'), lines.join('\n'));
console.log(`\n${rows.filter((r) => r.failed.length).length} of ${rows.length} caught. Written to results/defect-matrix.md`);
