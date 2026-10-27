// The merge rule (.github/rulesets/main-gates.json) lists the checks a pull request must pass. A name that no workflow produces would
// make every pull request wait forever, so this fails when one does not match a job in .github/workflows. (PLS-29.1)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ruleset = JSON.parse(fs.readFileSync(path.join(root, '.github/rulesets/main-gates.json'), 'utf8'));
const required = ruleset.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks.map((c) => c.context);

/** The `name:` of every job, with `${{ ... }}` (a matrix value) as a wildcard, and whether the workflow runs on every pull request. */
const jobs = [];
const dir = path.join(root, '.github/workflows');
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.yml'))) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const filtered = /pull_request:\s*\n\s+paths:/.test(text);
  for (const match of text.matchAll(/^ {4}name: (.+)$/gm)) {
    const name = match[1].trim().replace(/^["']|["']$/g, '');
    // A matrix value in the name (`Typecheck (${{ matrix.app }})`) matches anything.
    const escape = (text) => text.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `^${name
        .split(/\$\{\{[^}]*\}\}/)
        .map(escape)
        .join('.+')}$`,
    );
    jobs.push({ file, filtered, pattern });
  }
}

let bad = 0;
const fail = (message) => {
  console.error(message);
  bad++;
};
for (const context of required) {
  const hit = jobs.find((j) => j.pattern.test(context));
  if (!hit) fail(`"${context}" is required, but no workflow has a job with that name`);
  else if (hit.filtered)
    fail(
      `"${context}" is required, but ${hit.file} only runs on some pull requests (it has a paths filter), so the rest would wait for it forever`,
    );
}
if (bad) process.exit(1);
console.log(`OK: all ${required.length} required checks are jobs that run on every pull request.`);
