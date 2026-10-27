import rateLimit, { MemoryStore } from 'express-rate-limit';
import { config } from '../config';
import { ApiError } from '../lib/errors';
import { sendError } from './errorHandler';
import { testSessions } from '../lib/testSessions';
import { verifyAccessToken } from '../lib/tokens';
import { SESSION_COOKIE } from './auth';

const store = new MemoryStore();

/** Per user (or IP for guests), and per test session so sessions never use up each other's limit (PLS-28.7). */
function userKey(req: import('express').Request): string {
  const session = testSessions.currentId();
  return session ? `session:${session}:${clientKey(req)}` : clientKey(req);
}

function clientKey(req: import('express').Request): string {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.[SESSION_COOKIE];
  if (token) {
    try {
      return `user:${verifyAccessToken(token).sub}`;
    } catch {
      /* fall through to IP */
    }
  }
  return `ip:${req.ip}`;
}

export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  // Read on every request, and 0 turns the limit off (the perf profile, PLS-27.5).
  limit: () => Math.max(config.rateLimitPerMin, 1),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store,
  keyGenerator: userKey,
  skip: (req) => config.rateLimitPerMin <= 0 || req.path === '/health',
  handler: (req, res, _next, options) => {
    const resetTime = (req as any).rateLimit?.resetTime as Date | undefined;
    const retryAfter = resetTime ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000)) : Math.ceil(options.windowMs / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    sendError(res, new ApiError(429, 'RATE_LIMITED', 'Too many requests, please slow down', { retryAfterSeconds: retryAfter }));
  },
});

export function resetRateLimits() {
  store.resetAll();
}
