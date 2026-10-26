// Builds collections/*.postman_collection.json from src/collections/*.mjs, and data/*.csv from src/data/*.mjs.
// Run it with `npm run build` after changing anything under src/. The generated files are committed, so the
// collections can be imported into the Postman app without building anything.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
mkdirSync(join(root, 'collections'), { recursive: true });

const sources = readdirSync(join(here, 'collections')).filter((f) => f.endsWith('.mjs')).sort();
for (const file of sources) {
  const { default: collection } = await import(pathToFileURL(join(here, 'collections', file)).href);
  const out = join(root, 'collections', `${file.replace(/\.mjs$/, '')}.postman_collection.json`);
  writeFileSync(out, `${JSON.stringify(collection, null, 2)}\n`);
  console.log(`built ${out.replace(`${root}/`, '')}`);
}

const dataDir = join(here, 'data');
mkdirSync(join(root, 'data'), { recursive: true });
for (const file of (existsSync(dataDir) ? readdirSync(dataDir) : []).filter((f) => f.endsWith('.mjs')).sort()) {
  const { default: table } = await import(pathToFileURL(join(dataDir, file)).href);
  const cell = (value) => (/[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value));
  const csv = [table.columns, ...table.rows.map((row) => table.columns.map((c) => row[c] ?? ''))].map((r) => r.map(cell).join(',')).join('\n');
  const out = join(root, 'data', file.replace(/\.mjs$/, '.csv'));
  writeFileSync(out, `${csv}\n`);
  console.log(`built ${out.replace(`${root}/`, '')} (${table.rows.length} rows)`);
}
