import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { BUG_NAMES, BUGS, bugs, isBugOn } from '../src/lib/bugs';

const testHooks = config.testHooks;

afterEach(() => {
  bugs.clear();
  config.testHooks = testHooks;
});

describe('bug registry', () => {
  it('maps every defect to an AC or a named feature', () => {
    for (const name of BUG_NAMES) expect(BUGS[name].ac, name).toMatch(/\S/);
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
