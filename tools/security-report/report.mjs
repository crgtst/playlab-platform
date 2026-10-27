// Writes docs/security-report.md from what the security suite and the ZAP scans left on disk.
//
//   npm run security:report        (from the repo root)
//
// Reads tests/security/results/junit.xml (npm test), tests/security/results/defect-matrix.md (npm run test:defects) and
// tests/security/zap/reports/{baseline,api}.json (tests/security/zap/run-zap.sh). A part that has not been run is said so in the report.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJUnit } from '../traceability/trace.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => (fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : null);

/** OWASP API Security Top 10, 2023, as this project tests it. */
const RISKS = [
  { id: 'API1', name: 'Broken Object Level Authorization', acs: ['PLS-24.1'], defects: ['order-leak'] },
  {
    id: 'API2',
    name: 'Broken Authentication',
    acs: ['PLS-24.2', 'PLS-24.3'],
    defects: ['jwt-alg-none', 'token-never-expires', 'user-enumeration'],
  },
  {
    id: 'API3',
    name: 'Broken Object Property Level Authorization',
    acs: ['PLS-24.4', 'PLS-24.5'],
    defects: ['mass-assignment-role', 'excessive-data-exposure'],
  },
  { id: 'API4', name: 'Unrestricted Resource Consumption', acs: ['PLS-24.6', 'PLS-24.7'], defects: ['rate-limit-bypass', 'no-page-limit'] },
  { id: 'API5', name: 'Broken Function Level Authorization', acs: ['PLS-24.8'], defects: ['bfla-admin-users'] },
  { id: 'API6', name: 'Unrestricted Access to Sensitive Business Flows', acs: ['PLS-24.9'], defects: ['single-use-reused'] },
  { id: 'API7', name: 'Server Side Request Forgery', acs: ['PLS-24.10'], defects: ['ssrf-avatar-url'] },
  {
    id: 'API8',
    name: 'Security Misconfiguration',
    acs: ['PLS-24.11', 'PLS-24.12'],
    defects: ['missing-security-headers', 'verbose-errors'],
  },
  { id: 'API9', name: 'Improper Inventory Management', acs: ['PLS-24.13'], defects: ['shadow-api-v0'] },
  { id: 'API10', name: 'Unsafe Consumption of APIs', acs: ['PLS-24.14'], defects: ['trust-address-provider'] },
];

const word = (cases) => (!cases.length ? 'not run' : cases.every((c) => c.status === 'passed') ? 'pass' : 'FAIL');

const junit = read('tests/security/results/junit.xml');
const cases = junit ? parseJUnit(junit).cases : [];
// A test name is its describe path then its title (`... › PLS-24.1 customer A cannot ...`), so the AC is matched inside it.
const hasAc = (c, ac) => new RegExp(`${ac.replace('.', '\\.')}(?![0-9])`).test(c.name);
const secure = (ac) => cases.filter((c) => hasAc(c, ac) && !/ defect /.test(c.name));
const story = (defect) => cases.filter((c) => c.name.includes(` defect ${defect} `));

const matrixText = read('tests/security/results/defect-matrix.md');
const matrix = new Map();
for (const m of (matrixText ?? '').matchAll(/^\| `([a-z0-9-]+)` \| (PLS-\d+\.\d+) \| (\d+) \| (\d+) \| (yes|\*\*NO\*\*) \|$/gm)) {
  matrix.set(m[1], { ran: Number(m[3]), failed: Number(m[4]), caught: m[5] === 'yes' });
}

const lines = [];
const out = (...l) => lines.push(...l);

out(
  '# Security test report',
  '',
  'PlayLab is a deliberately breakable shop, and its security defects are switched on one at a time. This report says what the security',
  'suite proves about each of the OWASP API Security Top 10 (2023) risks, and what an OWASP ZAP scan finds on top of that.',
  'It is written by `npm run security:report` from the reports the suites leave on disk; nothing here is typed by hand except',
  'the notes on ZAP alerts.',
  '',
  '**Only ever run these tests and scans against your own local stack.**',
  '',
  '## What each test proves',
  '',
  'For every risk there is a **secure test** and a **defect test**:',
  '',
  "- The secure test asserts the safe behaviour (a customer gets 404 for someone else's order). It passes on the normal API.",
  '- The defect test switches on the defect that breaks it and asserts the exploit works. It shows the test can see the problem.',
  '- The defect matrix switches each defect on and runs the secure test of its AC. The secure test must **fail**: if it did not,',
  '  it would not notice the same flaw in a real API.',
  '',
  '## Results by risk',
  '',
);

const total = { tests: cases.length, passed: cases.filter((c) => c.status === 'passed').length };
out(
  junit
    ? `The suite ran ${total.tests} tests: ${total.passed} passed${total.tests - total.passed ? `, **${total.tests - total.passed} did not**` : ''}.`
    : '_The suite has not been run: there is no `tests/security/results/junit.xml`. Run `npm test` in `tests/security`._',
  '',
  '| Risk | AC | Defect | Secure test | Defect test | Fails with the defect on |',
  '| --- | --- | --- | --- | --- | --- |',
);
for (const risk of RISKS) {
  for (const defect of risk.defects) {
    const ac = risk.acs.find((a) => cases.some((c) => hasAc(c, a) && c.name.includes(` defect ${defect} `))) ?? risk.acs[0];
    const m = matrix.get(defect);
    out(
      `| ${risk.id} ${risk.name} | ${ac} | \`${defect}\` | ${word(secure(ac))} | ${word(story(defect))} | ${m ? (m.caught ? `yes (${m.failed} of ${m.ran})` : '**NO**') : 'not run'} |`,
    );
  }
}
out('');
if (!matrixText) out('_The defect matrix has not been run. Run `npm run test:defects` in `tests/security`._', '');

// ---- ZAP
function zapSection(title, file, scan) {
  const text = read(file);
  out(`### ${title}`, '');
  if (!text) {
    out(`_Not run: there is no \`${file}\`. Run \`bash tests/security/zap/run-zap.sh\`._`, '');
    return;
  }
  const json = JSON.parse(text);
  const alerts = (json.site ?? []).flatMap((s) => s.alerts ?? []);
  out(`${scan} ZAP ${json['@version'] ?? ''}, generated ${json['@generated'] ?? 'unknown'}.`, '');
  if (!alerts.length) {
    out('No alerts.', '');
    return;
  }
  const byRisk = (code) => alerts.filter((a) => a.riskcode === String(code)).length;
  out(`${alerts.length} alert types: ${byRisk(3)} high, ${byRisk(2)} medium, ${byRisk(1)} low, ${byRisk(0)} informational.`, '');
  out('| Risk | Alert | Instances | Rule |', '| --- | --- | ---: | --- |');
  for (const a of alerts.sort((x, y) => Number(y.riskcode) - Number(x.riskcode) || x.name.localeCompare(y.name))) {
    out(`| ${a.riskdesc.split(' ')[0]} | ${a.name} | ${a.instances?.length ?? a.count ?? ''} | ${a.pluginid} |`);
  }
  out('');
}

out(
  '## OWASP ZAP',
  '',
  'ZAP finds a different kind of problem from the tests above: it does not know the shop, so it reports what any scanner would.',
  'Alerts that are expected for a local lab (and why) are listed in `tests/security/zap/baseline-rules.tsv` and `api-rules.tsv`.',
  '',
);
zapSection(
  'Baseline scan of the web app',
  'tests/security/zap/reports/baseline.json',
  'A passive scan: ZAP spiders the pages and reads what comes back. It sends no attack payloads.',
);
zapSection(
  'API scan from the OpenAPI file',
  'tests/security/zap/reports/api.json',
  'An active scan: ZAP reads `openapi.yaml` and sends attack payloads to every operation, as an admin. The test hooks, the payment frame and `DELETE /users/me` are left out.',
);

const notes = read('tests/security/zap/NOTES.md');
if (notes) out('### Notes on the alerts', '', notes.trim(), '');

fs.writeFileSync(path.join(root, 'docs/security-report.md'), lines.join('\n') + '\n');
console.log('Wrote docs/security-report.md');
