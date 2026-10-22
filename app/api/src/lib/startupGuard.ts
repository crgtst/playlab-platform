/**
 * The production guard (PLS-28.5, finding R3): refuses to start with test hooks on when NODE_ENV=production, because the
 * hooks are unauthenticated and can create admins and wipe the database. PLAYLAB_ALLOW_UNSAFE=true overrides it, for
 * deliberate setups such as the perf profile. Returns why the API must not start, or null.
 */
export function startupProblem(env: NodeJS.ProcessEnv, testHooks: boolean): string | null {
  if (env.NODE_ENV !== 'production' || !testHooks || env.PLAYLAB_ALLOW_UNSAFE === 'true') return null;
  return (
    'Refusing to start: TEST_HOOKS=true with NODE_ENV=production. The test hooks are unauthenticated and can create ' +
    'admin users and wipe the database. Set TEST_HOOKS=false, or set PLAYLAB_ALLOW_UNSAFE=true if you really mean it.'
  );
}

/** Whether the override is in use, so start-up can warn about it. */
export function runningUnsafe(env: NodeJS.ProcessEnv, testHooks: boolean): boolean {
  return env.NODE_ENV === 'production' && testHooks && env.PLAYLAB_ALLOW_UNSAFE === 'true';
}
