import { describe, expect, it } from 'vitest';
import { runningUnsafe, startupProblem } from '../src/lib/startupGuard';

describe('PLS-28.5 production guard', () => {
  it('refuses test hooks in production', () => {
    expect(startupProblem({ NODE_ENV: 'production' }, true)).toMatch(/^Refusing to start: TEST_HOOKS=true with NODE_ENV=production/);
  });

  it('allows production with test hooks off', () => {
    expect(startupProblem({ NODE_ENV: 'production' }, false)).toBeNull();
  });

  it('allows test hooks outside production', () => {
    for (const NODE_ENV of ['development', 'test', undefined]) expect(startupProblem({ NODE_ENV }, true)).toBeNull();
  });

  it('allows production with test hooks when explicitly overridden, and flags it', () => {
    const env = { NODE_ENV: 'production', PLAYLAB_ALLOW_UNSAFE: 'true' };
    expect(startupProblem(env, true)).toBeNull();
    expect(runningUnsafe(env, true)).toBe(true);
    expect(runningUnsafe({ NODE_ENV: 'development' }, true)).toBe(false);
  });

  it('needs the override spelled exactly', () => {
    for (const PLAYLAB_ALLOW_UNSAFE of ['1', 'yes', 'TRUE', '']) {
      expect(startupProblem({ NODE_ENV: 'production', PLAYLAB_ALLOW_UNSAFE }, true)).not.toBeNull();
    }
  });
});
