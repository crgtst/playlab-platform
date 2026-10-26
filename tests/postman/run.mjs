// Runs the collections with Newman.
//   node run.mjs                          every collection, against the stack from app/.env
//   node run.mjs --only 02-catalogue      one collection (a name or part of one)
//   node run.mjs --env ci                 another environment from environments/
//   node run.mjs --defect lost-update     switch defects on (comma separated) for the run, to see what catches them
// BASE_URL overrides the address; otherwise it is http://localhost:<API_PORT from app/.env>.
import newman from 'newman';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shared = join(here, '..', 'shared');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

function baseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  const envFile = join(here, '..', '..', 'app', '.env');
  const port = existsSync(envFile) ? readFileSync(envFile, 'utf8').match(/^API_PORT=(\d+)/m)?.[1] : undefined;
  if (!port) throw new Error('Set BASE_URL, or API_PORT in app/.env, so the runner knows where the API is.');
  return `http://localhost:${port}`;
}

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const schemaDir = join(shared, 'schemas');
const schemas = Object.fromEntries(readdirSync(schemaDir).map((file) => [file, json(join(schemaDir, file))]));
const data = Object.fromEntries(['accounts', 'products', 'cards', 'discounts'].map((name) => [name, json(join(shared, `${name}.json`))]));

const environment = json(join(here, 'environments', `${option('--env', 'local')}.postman_environment.json`));
const only = option('--only');
const names = readdirSync(join(here, 'collections'))
  .filter((f) => f.endsWith('.postman_collection.json'))
  .map((f) => f.replace('.postman_collection.json', ''))
  .filter((name) => !only || name.includes(only))
  .sort();
if (names.length === 0) throw new Error(`No collection matches ${only}`);

mkdirSync(join(here, 'results'), { recursive: true });
const run = (name) =>
  new Promise((resolve, reject) => {
    const iterationData = join(here, 'data', `${name}.csv`);
    newman.run(
      {
        collection: join(here, 'collections', `${name}.postman_collection.json`),
        environment,
        // Set per run, never in the environment file: the address from app/.env, and the shared data and schemas.
        envVar: [
          { key: 'baseUrl', value: baseUrl() },
          { key: 'schemas', value: JSON.stringify(schemas) },
          { key: 'shared', value: JSON.stringify(data) },
          { key: 'defects', value: option('--defect', '') },
        ],
        ...(existsSync(iterationData) ? { iterationData } : {}),
        reporters: ['cli', 'junit', 'htmlextra'],
        reporter: {
          junit: { export: join(here, 'results', `junit-${name}.xml`) },
          htmlextra: { export: join(here, 'results', `${name}.html`), title: name, browserTitle: `PlayLab: ${name}` },
        },
      },
      (error, summary) => (error ? reject(error) : resolve({ name, summary })),
    );
  });

let failed = 0;
for (const name of names) {
  const { summary } = await run(name);
  failed += summary.run.failures.length;
  // One line per failed test, easy to find in a long log and to read in a defect matrix.
  for (const failure of summary.run.failures) console.log(`FAILED ${name} :: ${failure.error.test ?? failure.error.message}`);
}
console.log(failed === 0 ? '\nAll collections passed.' : `\n${failed} failure${failed === 1 ? '' : 's'}.`);
process.exitCode = failed === 0 ? 0 : 1;
