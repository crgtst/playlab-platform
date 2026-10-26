import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acIds, analyse, gate2, parseBugNames, parseCriteria, parseJUnit, resultOf } from './trace.mjs';

const CRITERIA = `## PLS-1 Login
| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-1.1 | Given x, when y, then z |  |  |
| PLS-1.4 | Given a, when b, then c |  | \`logout-incomplete\` |
## PLS-2 Other
| PLS-2.1 | Given x | | \`a-defect\`, \`b-defect\` |
`;

test('acIds finds one, several and "and" lists, and ignores story-only IDs', () => {
  assert.deepEqual(acIds('PLS-5.2 expired code is rejected'), ['PLS-5.2']);
  assert.deepEqual(acIds('PLS-25 Observability › PLS-25.4 and 25.5 metrics › a test'), ['PLS-25.4', 'PLS-25.5']);
  assert.deepEqual(acIds('PLS-1.1, 1.2 and 1.3 together'), ['PLS-1.1', 'PLS-1.2', 'PLS-1.3']);
  assert.deepEqual(acIds('PLS-8 Admin order management › no ac here'), []);
});

test('parseCriteria reads stories, criteria and defects', () => {
  const { stories, criteria } = parseCriteria(CRITERIA);
  assert.deepEqual(
    stories.map((s) => s.number),
    [1, 2],
  );
  assert.deepEqual(
    criteria.map((c) => [c.id, c.defects]),
    [
      ['PLS-1.1', []],
      ['PLS-1.4', ['logout-incomplete']],
      ['PLS-2.1', ['a-defect', 'b-defect']],
    ],
  );
});

test('parseBugNames reads the keys of BUGS only', () => {
  const source =
    "const OTHER = {\n  'not-a-bug': 1,\n};\nexport const BUGS = {\n  'one-bug': { ac: 'PLS-1.1' },\n  'two-bug': { ac: 'PLS-1.2' },\n} as const;";
  assert.deepEqual(parseBugNames(source), ['one-bug', 'two-bug']);
});

test('parseJUnit reads passing, failing, skipped, self-closing and escaped cases', () => {
  const xml = `<testsuites><testsuite name="s" timestamp="2026-01-01T00:00:00Z">
<testcase name="PLS-1.1 a &amp; b &gt; c" classname="x" time="1"></testcase>
<testcase name="PLS-1.2 fails"><failure message="no">trace</failure></testcase>
<testcase name="PLS-1.3 skipped"><skipped/></testcase>
<testcase name="PLS-1.4 short" classname="y"/>
</testsuite></testsuites>`;
  const { cases, started } = parseJUnit(xml);
  assert.equal(started, '2026-01-01T00:00:00Z');
  assert.deepEqual(
    cases.map((c) => [c.name, c.status]),
    [
      ['PLS-1.1 a & b > c', 'passed'],
      ['PLS-1.2 fails', 'failed'],
      ['PLS-1.3 skipped', 'skipped'],
      ['PLS-1.4 short', 'passed'],
    ],
  );
});

test('resultOf', () => {
  assert.equal(resultOf([]), 'none');
  assert.equal(resultOf([{ status: 'passed' }, { status: 'failed' }]), 'fail');
  assert.equal(resultOf([{ status: 'skipped' }]), 'skipped');
  assert.equal(resultOf([{ status: 'passed' }, { status: 'skipped' }]), 'pass');
});

test('analyse maps tests to ACs and defects, and flags unknown IDs', () => {
  const { stories, criteria } = parseCriteria(CRITERIA);
  const tests = [
    { name: 'PLS-1.1 works', status: 'passed', tool: 'T', ids: ['PLS-1.1'] },
    { name: 'PLS-1.4 detects the logout-incomplete defect', status: 'passed', tool: 'T', ids: ['PLS-1.4'] },
    { name: 'PLS-9.9 typo', status: 'passed', tool: 'T', ids: ['PLS-9.9'] },
  ];
  const scope = { notBuilt: {}, otherTools: {}, phase1Defects: [], gate2Stories: { from: 1, to: 2 } };
  const result = analyse({ criteria, stories, bugNames: ['logout-incomplete', 'a-defect'], scope, tests });
  assert.deepEqual(
    result.rows.map((r) => [r.id, r.result]),
    [
      ['PLS-1.1', 'pass'],
      ['PLS-1.4', 'pass'],
      ['PLS-2.1', 'none'],
    ],
  );
  assert.deepEqual([...result.unknown.keys()], ['PLS-9.9']);
  const caught = Object.fromEntries(result.defects.map((d) => [d.name, d.caught.length]));
  assert.deepEqual(caught, { 'a-defect': 0, 'b-defect': 0, 'logout-incomplete': 1 });
  const g = gate2(result, scope);
  assert.equal(g.passed, false);
  assert.deepEqual(
    g.uncovered.map((r) => r.id),
    ['PLS-2.1'],
  );
  assert.deepEqual(
    g.missed.map((d) => d.name),
    ['a-defect'],
  );
});
