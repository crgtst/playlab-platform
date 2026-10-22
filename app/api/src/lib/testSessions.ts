import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { ApiError } from './errors';
import { requestContext } from './requestContext';

/**
 * Test sessions (PLS-28): each one has its own defects, clock offset, latency and chaos rules and rate-limit
 * counters, so parallel test workers don't change each other's runs. Requests with no session use the global
 * state, exactly as before sessions existed. Database rows stay shared.
 */
export interface TestSession {
  id: string;
  lastUsedMs: number;
}

export const TEST_SESSION_HEADER = 'X-Test-Session';
export const TEST_SESSION_COOKIE = 'test_session';
/** The payment frame is on the API origin, so the shop passes the session in the frame's URL (PLS-28.10). */
export const TEST_SESSION_PARAM = 'testSession';

const sessions = new Map<string, TestSession>();
const resetters: (() => void)[] = [];

/** State with one copy per test session, plus the global copy used by requests with no session. */
export function sessionScoped<T>(create: () => T): () => T {
  let globalValue = create();
  const perSession = new WeakMap<TestSession, T>();
  resetters.push(() => (globalValue = create()));
  return () => {
    const session = requestContext()?.testSession;
    // A session ended by reset or expiry falls back to the global state, even for a request still running (a stream).
    if (!session || sessions.get(session.id) !== session) return globalValue;
    let value = perSession.get(session);
    if (value === undefined) perSession.set(session, (value = create()));
    return value;
  };
}

/** Finds a live session. Idle time is real time, so moving a session's clock never expires it. */
function lookup(id: string): TestSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (Date.now() - session.lastUsedMs > config.testSessionIdleMs) {
    sessions.delete(id);
    return undefined;
  }
  session.lastUsedMs = Date.now();
  return session;
}

export const testSessions = {
  create(): TestSession {
    const session = { id: randomUUID(), lastUsedMs: Date.now() };
    sessions.set(session.id, session);
    return session;
  },
  /** The request's session id, or null for the global state. */
  currentId: (): string | null => requestContext()?.testSession?.id ?? null,
  /** Ends every session and resets the global state (POST /test/reset, PLS-28.9). */
  resetAll() {
    sessions.clear();
    resetters.forEach((reset) => reset());
  },
};

/** Attaches the session named by the X-Test-Session header, the test_session cookie or the payment frame's URL. */
export function resolveTestSession(req: Request, _res: Response, next: NextFunction) {
  const fromUrl = req.path.startsWith('/pay/') ? req.query[TEST_SESSION_PARAM] : undefined;
  const requested = req.get(TEST_SESSION_HEADER) || (typeof fromUrl === 'string' && fromUrl) || req.cookies?.[TEST_SESSION_COOKIE];
  const ctx = requestContext();
  if (ctx && requested) {
    ctx.requestedTestSession = requested;
    ctx.testSession = lookup(requested);
  }
  next();
}

/**
 * Hook calls naming an unknown or expired session get 404 rather than silently changing the global state (PLS-28.8).
 * Creating a session and resetting everything work whatever session is named.
 */
export function requireKnownTestSession(req: Request, _res: Response, next: NextFunction) {
  const ctx = requestContext();
  const exempt = req.method === 'POST' && (req.path === '/sessions' || req.path === '/reset');
  if (ctx?.requestedTestSession && !ctx.testSession && !exempt) {
    return next(new ApiError(404, 'TEST_SESSION_NOT_FOUND', 'No test session with that id; it may have expired'));
  }
  next();
}
