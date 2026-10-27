#!/usr/bin/env node
/**
 * Traceability: merges the JUnit XML every suite writes into a matrix of acceptance criteria x tools, and checks it.
 *
 *   node tools/traceability/trace.mjs            write docs/traceability.md
 *   node tools/traceability/trace.mjs --check    exit 1 if a test names an AC ID that does not exist
 *   node tools/traceability/trace.mjs --check-sources  exit 1 if a test source names an AC ID that does not exist (needs no results)
 *   node tools/traceability/trace.mjs --gate3    exit 1 unless every AC is covered, nothing fails and every defect is caught
 *   node tools/traceability/trace.mjs --reports <dir>  read the JUnit files from <dir>/tests/<suite>/ instead of the repo
 *   node tools/traceability/trace.mjs --gate2    exit 1 unless the Gate 2 conditions hold
 *
 * An AC is covered by a test whose name contains its ID (`PLS-5.2 expired code is rejected`); a defect is caught by a
 * passing test whose name contains the defect's name. See "Traceability rules" in docs/REVIEW_AND_PLAN.md.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const TOOL_NAMES = {
  'playwright-ts': 'Playwright (TypeScript)',
  'playwright-java': 'Playwright (Java)',
  'playwright-python': 'Playwright (Python)',
  postman: 'Postman',
  karate: 'Karate',
  'rest-assured': 'REST Assured',
  k6: 'k6',
  jmeter: 'JMeter',
  contract: 'Contract',
  security: 'Security',
};

// ---------------------------------------------------------------- parsing

/** The stories and criteria in docs/ACCEPTANCE_CRITERIA.md, with the defects each one names. */
export function parseCriteria(markdown) {
  const stories = [];
  const criteria = [];
  for (const line of markdown.split('\n')) {
    const story = line.match(/^## PLS-(\d+) (.+)$/);
    if (story) {
      stories.push({ number: Number(story[1]), title: story[2].trim() });
      continue;
    }
    const row = line.match(/^\| (PLS-(\d+)\.(\d+)) \|(.*)$/);
    if (!row) continue;
    const cells = row[4].split('|').map((cell) => cell.trim());
    // cells: text, test id, defects, '' (the line ends with a pipe)
    const defects = [...(cells[2] ?? '').matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
    criteria.push({ id: row[1], story: Number(row[2]), number: Number(row[3]), text: cells[0], defects });
  }
  return { stories, criteria };
}

/** The defect names in app/api/src/lib/bugs.ts (the built ones). */
export function parseBugNames(source) {
  const start = source.indexOf('export const BUGS');
  const body = start >= 0 ? source.slice(start) : source;
  return [...body.matchAll(/^ {2}'([a-z0-9-]+)':/gm)].map((m) => m[1]);
}

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&amp;': '&' };
const unescapeXml = (text) => text.replace(/&(?:lt|gt|quot|apos|#39|amp);/g, (entity) => ENTITIES[entity]);

/** The test cases in one JUnit XML report: name, status (passed, failed, skipped) and when the run started. */
export function parseJUnit(xml) {
  const cases = [];
  const started = xml.match(/<testsuite\b[^>]*\btimestamp="([^"]+)"/)?.[1] ?? null;
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const name = match[1].match(/\bname="([^"]*)"/)?.[1];
    if (name === undefined) continue;
    const inner = match[2] ?? '';
    let status = 'passed';
    if (/<(failure|error)\b/.test(inner)) status = 'failed';
    else if (/<skipped\b/.test(inner)) status = 'skipped';
    cases.push({ name: unescapeXml(name), status });
  }
  return { cases, started };
}

/** Every AC ID a test name mentions, including "PLS-25.4 and 25.5" and "PLS-1.1, 1.2". */
export function acIds(name) {
  const ids = new Set();
  for (const match of name.matchAll(/PLS-\d+\.\d+(?:(?:\s*,\s*|\s+and\s+)\d+\.\d+)*/g)) {
    for (const part of match[0].matchAll(/(\d+)\.(\d+)/g)) ids.add(`PLS-${part[1]}.${part[2]}`);
  }
  return [...ids];
}

/** pass, fail, skipped or none for the tests covering one AC or defect. */
export function resultOf(tests) {
  if (tests.length === 0) return 'none';
  if (tests.some((t) => t.status === 'failed')) return 'fail';
  if (tests.every((t) => t.status === 'skipped')) return 'skipped';
  return 'pass';
}

// ---------------------------------------------------------------- reading the repo

/** JUnit XML files written by the suites under tests/ (Playwright, Newman, Surefire, k6, and Karate's karate-reports). */
export function findReports(root = ROOT) {
  const found = [];
  const walk = (dir, depth) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 5) walk(path, depth + 1);
      } else if (/^(junit.*|TEST-.*)\.xml$/.test(entry.name) || (/[\\/]karate-reports$/.test(dir) && entry.name.endsWith('.xml'))) {
        found.push(path);
      }
    }
  };
  const tests = join(root, 'tests');
  if (existsSync(tests)) walk(tests, 0);
  return found.sort();
}

const toolOf = (path, root) => {
  const dir = relative(join(root, 'tests'), path).split(/[\\/]/)[0];
  return TOOL_NAMES[dir] ?? dir;
};

export function readTests(root = ROOT, reports = findReports(root)) {
  const tests = [];
  const sources = [];
  for (const path of reports) {
    const { cases, started } = parseJUnit(readFileSync(path, 'utf8'));
    const tool = toolOf(path, root);
    sources.push({ path: relative(root, path), tool, tests: cases.length, started });
    for (const test of cases) tests.push({ ...test, tool, ids: acIds(test.name) });
  }
  return { tests, sources };
}

// ---------------------------------------------------------------- the analysis

export function analyse({ criteria, stories, bugNames, scope, tests }) {
  const known = new Set(criteria.map((c) => c.id));
  const byAc = new Map(criteria.map((c) => [c.id, []]));
  const unknown = new Map();
  for (const test of tests) {
    for (const id of test.ids) {
      if (known.has(id)) byAc.get(id).push(test);
      else unknown.set(id, [...(unknown.get(id) ?? []), test.name]);
    }
  }

  const rows = criteria.map((c) => {
    const covering = byAc.get(c.id);
    const note = scope.notBuilt?.[c.id] ?? scope.otherTools?.[c.id] ?? scope.otherTools?.[`PLS-${c.story}`] ?? null;
    return {
      ...c,
      tests: covering,
      result: resultOf(covering),
      tools: [...new Set(covering.map((t) => t.tool))],
      note,
      notBuilt: Boolean(scope.notBuilt?.[c.id]),
    };
  });

  const defects = [...new Set([...criteria.flatMap((c) => c.defects), ...bugNames])].sort().map((name) => {
    const caught = tests.filter((t) => t.status === 'passed' && t.name.includes(name));
    const acs = criteria.filter((c) => c.defects.includes(name)).map((c) => c.id);
    return { name, acs, built: bugNames.includes(name), caught, tools: [...new Set(caught.map((t) => t.tool))] };
  });

  return { rows, defects, unknown, stories };
}

export function gate2({ rows, defects }, scope) {
  const { from, to } = scope.gate2Stories;
  const original = rows.filter((r) => r.story >= from && r.story <= to);
  const uncovered = original.filter((r) => r.result !== 'pass' && !r.note);
  const originalDefects = defects.filter(
    (d) => d.built && !scope.phase1Defects.includes(d.name) && !(scope.phase3Defects ?? []).includes(d.name),
  );
  const missed = originalDefects.filter((d) => d.caught.length === 0);
  return { original, uncovered, originalDefects, missed, passed: uncovered.length === 0 && missed.length === 0 };
}

/**
 * Gate 3, the release gate (and the pipeline's): every AC that is in scope has a passing test, nothing fails, and every defect that is
 * built is caught by a passing test.
 */
export function gate3({ rows, defects }) {
  const uncovered = rows.filter((r) => r.result !== 'pass' && !r.note);
  const failing = rows.filter((r) => r.result === 'fail');
  const missed = defects.filter((d) => d.built && d.caught.length === 0);
  return { uncovered, failing, missed, passed: uncovered.length === 0 && failing.length === 0 && missed.length === 0 };
}

const SOURCE_DIRS = ['tests', 'app/api/test', 'app/e2e/specs', 'app/web/pact', 'app/web/playwright'];
const SOURCE_FILES = /\.(ts|tsx|java|feature|mjs|js)$/;
const SKIP_DIRS = new Set(['node_modules', 'target', 'results', 'dist', 'test-results', 'playwright-report', 'schemas', '.git']);

/** AC IDs named in test source files, by file: the check that needs no test results, so a pull request can run it. */
export function acIdsInSources(root = ROOT) {
  const found = new Map();
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (SOURCE_FILES.test(entry.name)) {
        for (const line of readFileSync(path, 'utf8').split('\n')) {
          for (const id of acIds(line)) {
            if (!found.has(id)) found.set(id, []);
            found.get(id).push(relative(root, path));
          }
        }
      }
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(root, dir));
  return found;
}

// ---------------------------------------------------------------- the report

const ICON = { pass: 'pass', fail: '**FAIL**', skipped: 'skipped', none: '' };

function table(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join(
    '\n',
  );
}

export function render({ rows, defects, unknown, stories }, sources, scope) {
  const out = [];
  const counted = rows.filter((r) => !r.note);
  const covered = counted.filter((r) => r.result === 'pass');
  const failing = rows.filter((r) => r.result === 'fail');
  const builtDefects = defects.filter((d) => d.built);
  const caught = builtDefects.filter((d) => d.caught.length > 0);
  const g2 = gate2({ rows, defects }, scope);

  out.push('# Traceability', '');
  out.push(
    'Generated by `npm run traceability` from the JUnit XML each suite writes. Do not edit by hand. An AC is covered by a test whose name contains its ID; a defect is caught by a passing test whose name contains the defect name.',
    '',
  );
  out.push('## Summary', '');
  out.push(
    table(
      ['', ''],
      [
        ['Acceptance criteria', String(rows.length)],
        ['Out of scope for these suites (not built yet, or another tool)', String(rows.length - counted.length)],
        ['In scope, covered by a passing test', `${covered.length} of ${counted.length}`],
        ['Failing', String(failing.length)],
        ['Defects built', String(builtDefects.length)],
        ['Defects caught by a passing test', `${caught.length} of ${builtDefects.length}`],
        [
          `Gate 2 (PLS-${scope.gate2Stories.from} to ${scope.gate2Stories.to} covered, all original defects caught)`,
          g2.passed ? 'met' : 'not met',
        ],
      ],
    ),
    '',
  );

  out.push('## Reports read', '');
  out.push(
    table(
      ['Suite', 'File', 'Tests', 'Run started'],
      sources.map((s) => [s.tool, `\`${s.path}\``, String(s.tests), s.started ?? 'unknown']),
    ),
    '',
  );

  out.push('## By story', '');
  out.push(
    table(
      ['Story', 'In scope', 'Covered', 'Failing', 'No test'],
      stories.map((story) => {
        const own = rows.filter((r) => r.story === story.number);
        const inScope = own.filter((r) => !r.note);
        return [
          `PLS-${story.number} ${story.title}`,
          String(inScope.length),
          String(inScope.filter((r) => r.result === 'pass').length),
          String(own.filter((r) => r.result === 'fail').length),
          String(inScope.filter((r) => r.result === 'none').length),
        ];
      }),
    ),
    '',
  );

  out.push('## Acceptance criteria', '');
  out.push(
    table(
      ['AC', 'Covered by', 'Result', 'Defects', 'Note'],
      rows.map((r) => [
        r.id,
        r.tools.map((tool) => `${tool} x${r.tests.filter((t) => t.tool === tool).length}`).join(', '),
        ICON[r.result],
        r.defects.map((d) => `\`${d}\``).join(', '),
        r.note ?? '',
      ]),
    ),
    '',
  );

  const gaps = counted.filter((r) => r.result !== 'pass');
  out.push('## Gaps', '');
  out.push(gaps.length ? gaps.map((r) => `- ${r.id} (${r.result === 'none' ? 'no test' : r.result}): ${r.text}`).join('\n') : 'None.', '');

  out.push('## Defects', '');
  out.push(
    table(
      ['Defect', 'AC', 'Built', 'Caught by'],
      defects.map((d) => [
        `\`${d.name}\``,
        d.acs.join(', '),
        d.built ? 'yes' : 'planned',
        d.built
          ? d.tools.length
            ? d.tools.map((tool) => `${tool} x${d.caught.filter((t) => t.tool === tool).length}`).join(', ')
            : '**not caught**'
          : '',
      ]),
    ),
    '',
  );

  if (unknown.size) {
    out.push('## Tests that name an AC that does not exist', '');
    for (const [id, names] of unknown) out.push(`- ${id}: ${names.join('; ')}`);
    out.push('');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- command line

function main(argv) {
  if (argv.includes('--check-sources')) {
    const known = new Set(parseCriteria(readFileSync(join(ROOT, 'docs/ACCEPTANCE_CRITERIA.md'), 'utf8')).criteria.map((c) => c.id));
    const unknown = [...acIdsInSources()].filter(([id]) => !known.has(id));
    if (!unknown.length) {
      console.log(`OK: every AC ID named in the test sources exists (${known.size} ACs).`);
      return 0;
    }
    for (const [id, files] of unknown) console.error(`${id} does not exist (named in ${[...new Set(files)].slice(0, 3).join(', ')})`);
    return 1;
  }

  const scope = JSON.parse(readFileSync(join(ROOT, 'tools/traceability/scope.json'), 'utf8'));
  const { stories, criteria } = parseCriteria(readFileSync(join(ROOT, 'docs/ACCEPTANCE_CRITERIA.md'), 'utf8'));
  const bugNames = parseBugNames(readFileSync(join(ROOT, 'app/api/src/lib/bugs.ts'), 'utf8'));
  // --reports <dir>: read the JUnit files from <dir>/tests/<suite>/... (the pages workflow assembles them from the pipelines' artifacts).
  const reportsIndex = argv.indexOf('--reports');
  const reportsRoot = reportsIndex >= 0 ? resolve(argv[reportsIndex + 1]) : ROOT;
  const { tests, sources } = readTests(reportsRoot);
  const result = analyse({ criteria, stories, bugNames, scope, tests });

  if (argv.includes('--check')) {
    if (result.unknown.size === 0) {
      console.log(`OK: every AC ID named by ${tests.length} tests exists.`);
      return 0;
    }
    for (const [id, names] of result.unknown)
      console.error(`${id} does not exist (${names.length} test${names.length === 1 ? '' : 's'}): ${names[0]}`);
    return 1;
  }

  if (argv.includes('--gate2')) {
    const g = gate2(result, scope);
    console.log(
      `Gate 2: ${g.original.length} ACs in PLS-${scope.gate2Stories.from} to ${scope.gate2Stories.to}, ${g.uncovered.length} without a passing test.`,
    );
    for (const r of g.uncovered) console.log(`  ${r.id} (${r.result}): ${r.text}`);
    console.log(`Gate 2: ${g.originalDefects.length} original defects, ${g.missed.length} not caught.`);
    for (const d of g.missed) console.log(`  ${d.name} (${d.acs.join(', ')})`);
    console.log(g.passed ? 'Gate 2 met.' : 'Gate 2 not met.');
    return g.passed ? 0 : 1;
  }

  if (argv.includes('--gate3')) {
    const g = gate3(result);
    console.log(
      `Gate 3: ${g.uncovered.length} ACs without a passing test, ${g.failing.length} failing, ${g.missed.length} defects not caught.`,
    );
    for (const r of g.uncovered) console.log(`  ${r.id} (${r.result}): ${r.text}`);
    for (const d of g.missed) console.log(`  defect ${d.name} (${d.acs.join(', ')})`);
    console.log(g.passed ? 'Gate 3 met.' : 'Gate 3 not met.');
    return g.passed ? 0 : 1;
  }

  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? resolve(argv[outIndex + 1]) : join(ROOT, 'docs/traceability.md');
  writeFileSync(out, `${render(result, sources, scope)}\n`);
  console.log(`Wrote ${relative(ROOT, out)} from ${sources.length} report${sources.length === 1 ? '' : 's'} (${tests.length} tests).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
