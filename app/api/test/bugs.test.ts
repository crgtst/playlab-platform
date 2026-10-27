import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { BUG_NAMES, BUGS, bugs, isBugOn } from '../src/lib/bugs';

const testHooks = config.testHooks;

// Defects that planned stories (PLS-20 to PLS-29) already name. Move each one into bugs.ts when it is built.
const PLANNED_DEFECTS = ['excessive-data-exposure', 'no-page-limit', 'ssrf-avatar-url', 'shadow-api-v0', 'trust-address-provider'];

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
