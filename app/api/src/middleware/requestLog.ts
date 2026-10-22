import { NextFunction, Request, Response } from 'express';
import { bugs } from '../lib/bugs';
import { logger } from '../lib/logger';
import { CORRELATION_HEADER } from '../lib/requestContext';

/** Set by sendError, so a failed request's log line says why it failed. */
export interface LoggedError {
  code: string;
  message: string;
}

// The container healthcheck calls this every 2 seconds; logging it would drown everything else.
const UNLOGGED = new Set(['/api/v1/health/live']);

/**
 * Records the matched route, such as /api/v1/orders/:id, when Express matches it. Express sets req.route at that
 * moment, while req.baseUrl still holds the full mount path; by the time an error reaches the end, both have reset.
 */
function trackRoute(req: Request): () => string | null {
  let matched: string | null = null;
  let current: unknown = undefined;
  Object.defineProperty(req, 'route', {
    configurable: true,
    enumerable: true,
    get: () => current,
    set(route: { path: string } | undefined) {
      current = route;
      if (route) matched = `${req.baseUrl}${route.path === '/' ? '' : route.path}` || '/';
    },
  });
  return () => matched;
}

/** Writes one JSON line per request when the response finishes (PLS-25.2). */
export function requestLog(req: Request, res: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  // req.path changes as routers strip their mount paths, so keep the path as received.
  const path = req.originalUrl.split('?')[0];
  const route = trackRoute(req);
  res.on('finish', () => {
    if (UNLOGGED.has(path)) return;
    const error = res.locals.error as LoggedError | undefined;
    logger.info(
      {
        correlationId: res.getHeader(CORRELATION_HEADER),
        method: req.method,
        route: route(),
        path,
        status: res.statusCode,
        durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100,
        userId: req.user?.id ?? null,
        testSession: null,
        defects: bugs.active(),
        req: { query: req.query, headers: req.headers, body: req.body },
        ...(error && { error }),
      },
      `${req.method} ${path} ${res.statusCode}`,
    );
  });
  next();
}
