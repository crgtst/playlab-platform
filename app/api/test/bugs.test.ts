import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { BUG_NAMES, BUGS, bugs, isBugOn } from '../src/lib/bugs';

const testHooks = config.testHooks;

// Defects that planned stories (PLS-20 to PLS-29) already name. Move each one into bugs.ts when it is built.
const PLANNED_DEFECTS: string[] = [];

afterEach(() => {
  bugs.clear();
  config.testHooks = testHooks;
});

describe('bug registry', () => {
  it('maps every defect to at least one AC ID', () => {
    for (const name of BUG_NAMES) expect(BUGS[name].ac, name).toMatch(/^PLS-\d+\.\d+(, PLS-\d+\.\d+)*$/);
  });

  it("agrees with the 'Defect it catches' column in ACCEPTANCE_CRITERIA.md", () => {
    const md = fs.readFileSync(path.join(__dirname, '../../../docs/ACCEPTANCE_CRITERIA.md'), 'utf8');
    const fromAcs = new Map<string, string[]>();
    for (const [, id, defects] of md.matchAll(/^\| (PLS-\d+\.\d+) \|.*\| *([^|]*?) *\|$/gm)) {
      for (const [, name] of defects.matchAll(/`([a-z0-9-]+)`/g)) fromAcs.set(name, [...(fromAcs.get(name) ?? []), id]);
    }
    const planned = PLANNED_DEFECTS.filter((n) => fromAcs.delete(n));
    expect(planned, 'every planned defect is named by an AC').toEqual(PLANNED_DEFECTS);
    expect(
      PLANNED_DEFECTS.filter((n) => n in BUGS),
      'planned defects not yet in bugs.ts',
    ).toEqual([]);
    const fromBugs = new Map(BUG_NAMES.map((n) => [n as string, BUGS[n].ac.split(', ')]));
    expect(Object.fromEntries(fromBugs)).toEqual(Object.fromEntries(fromAcs));
  });

  it('adds up to the 47 defects in the plan once the planned ones are built', () => {
    expect(BUG_NAMES.length + PLANNED_DEFECTS.length).toBe(47);
  });

  it('has a test that names every defect', () => {
    // The platform's own tests (api, e2e) and the tool suites under tests/ are where a defect is proved to be caught.
    const roots = [
      'app/api/test',
      'app/e2e/specs',
      'app/web/src',
      'tests/playwright-ts/specs',
      'tests/karate/src',
      'tests/rest-assured/src',
    ];
    const repo = path.join(__dirname, '../../..');
    const files: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/(\.(spec|test|int\.test)\.tsx?|Test\.java|\.feature)$/.test(e.name) && e.name !== 'bugs.test.ts') files.push(full);
      }
    };
    for (const r of roots) walk(path.join(repo, r));
    const text = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(
      BUG_NAMES.filter((n) => !text.includes(n)),
      'defects no test names',
    ).toEqual([]);
  });

  it('starts with every defect off', () => {
    config.testHooks = true;
    expect(bugs.active()).toEqual([]);
    expect(BUG_NAMES.some((n) => isBugOn(n))).toBe(false);
  });

  it('switches on only the named defect', () => {
    config.testHooks = true;
    bugs.enable(['wrong-status-code']);
    expect(isBugOn('wrong-status-code')).toBe(true);
    expect(BUG_NAMES.filter((n) => isBugOn(n))).toEqual(['wrong-status-code']);
  });

  it('keeps every defect off when TEST_HOOKS is false, even if enabled', () => {
    config.testHooks = false;
    bugs.enable(['wrong-status-code', 'order-leak']);
    expect(isBugOn('wrong-status-code')).toBe(false);
    expect(isBugOn('order-leak')).toBe(false);
    expect(bugs.active()).toEqual([]);
  });
});
