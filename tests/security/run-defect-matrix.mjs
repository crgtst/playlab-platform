// For every defect, switches it on (DEFECTS=name) and runs the secure test for its AC. The test must fail: that is what
// "the test catches the defect" means. Writes results/defect-matrix.md and exits 1 if any defect goes unnoticed.
//
//   npm run test:defects                # every defect
//   npm run test:defects -- user-enumeration order-leak
//
// The defect-story tests (titles with "defect <name>") are left out of these runs: they switch the defect on themselves.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const specsDir = path.join(import.meta.dirname, 'specs');
const found = [];
for (const file of fs
  .readdirSync(specsDir)
  .filter((f) => f.endsWith('.spec.ts'))
  .sort()) {
  const text = fs.readFileSync(path.join(specsDir, file), 'utf8');
  for (const m of text.matchAll(/test\(\s*['"`](PLS-\d+\.\d+) defect ([a-z0-9-]+)/g)) found.push({ ac: m[1], defect: m[2], file });
}

const only = process.argv.slice(2);
const rows = [];
for (const { ac, defect, file } of found.filter((f) => !only.length || only.includes(f.defect))) {
  const grep = `${ac.replace('.', '\\.')} `;
  const run = spawnSync('npx', ['playwright', 'test', '--grep', grep, '--grep-invert', 'defect ', '--reporter=json'], {
    cwd: import.meta.dirname,
    env: { ...process.env, DEFECTS: defect },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  let stats = { expected: 0, unexpected: 0 };
  try {
    stats = JSON.parse(run.stdout).stats;
  } catch {
    /* no JSON: the run itself broke, which counts as not caught */
  }
  const ran = stats.expected + stats.unexpected;
  const caught = ran > 0 && stats.unexpected > 0 && run.status !== 0;
  rows.push({ defect, ac, file, ran, failed: stats.unexpected, caught });
  console.log(`${caught ? 'caught ' : 'MISSED '} ${defect} (${ac}): ${stats.unexpected} of ${ran} secure test(s) failed with it on`);
}

const md = [
  '# Defect matrix',
  '',
  'Each defect is switched on for the secure test of its AC. The test must fail, or it would not notice the defect in a real API.',
  '',
  '| Defect | AC | Secure tests run | Failed with the defect on | Caught |',
  '| --- | --- | ---: | ---: | --- |',
  ...rows.map((r) => `| \`${r.defect}\` | ${r.ac} | ${r.ran} | ${r.failed} | ${r.caught ? 'yes' : '**NO**'} |`),
  '',
].join('\n');
fs.mkdirSync(path.join(import.meta.dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(import.meta.dirname, 'results/defect-matrix.md'), md);
console.log(`\n${rows.filter((r) => r.caught).length} of ${rows.length} defects caught. Written to results/defect-matrix.md`);
process.exit(rows.every((r) => r.caught) && rows.length > 0 ? 0 : 1);
