// Fails (exit 1) if the JUnit file a k6 run wrote has a failed case, and says which.
import fs from 'node:fs';

const file = process.argv[2];
if (!fs.existsSync(file)) {
  console.error(`No ${file}: the run did not get as far as writing its summary.`);
  process.exit(1);
}
const xml = fs.readFileSync(file, 'utf8');
const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const failed = [...xml.matchAll(/<testcase[^>]*name="([^"]*)"[^>]*>\s*<failure/g)].map((m) => unescape(m[1]));
const total = (xml.match(/<testcase\b/g) ?? []).length;
if (failed.length) {
  console.error(`\n${failed.length} of ${total} checks failed:`);
  for (const name of failed) console.error(`  FAIL ${name}`);
  process.exit(1);
}
console.log(`\nAll ${total} checks passed (${file})`);
