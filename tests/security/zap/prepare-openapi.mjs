// Writes the OpenAPI file ZAP's API scan reads: the running API's own file without what a scanner must not touch.
//
//   node zap/prepare-openapi.mjs <api base url> <output file> [base url ZAP uses]
//
// Left out: the test hooks (/test, a scanner would reset the data or switch on chaos in the middle of its own run), the payment
// frame and metrics (not part of /api/v1), and DELETE /users/me (the scanner would delete the account whose token it is using).
import fs from 'node:fs';

const [base = 'http://localhost:3000', out = 'zap/openapi-api.json', zapBase = base] = process.argv.slice(2);
const spec = await (await fetch(`${base}/api/openapi.json`)).json();

const paths = {};
for (const [path, item] of Object.entries(spec.paths)) {
  if (/^\/(test|pay|metrics)/.test(path)) continue;
  const kept = { ...item };
  if (path === '/users/me') delete kept.delete;
  paths[path] = kept;
}
fs.mkdirSync(new URL('.', `file://${process.cwd()}/${out}`).pathname, { recursive: true });
fs.writeFileSync(out, JSON.stringify({ ...spec, servers: [{ url: `${zapBase}/api/v1` }], paths }, null, 2));
console.log(`${Object.keys(paths).length} of ${Object.keys(spec.paths).length} paths written to ${out}`);
