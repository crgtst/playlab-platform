import { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isBugOn } from '../lib/bugs';
import { ApiError } from '../lib/errors';
import { logger } from '../lib/logger';
import { CORRELATION_HEADER } from '../lib/requestContext';
import { zod3Issues } from '../lib/zod';

export function sendError(res: Parameters<RequestHandler>[1], err: ApiError) {
  // wrong-status-code: validation failures surface as a 500.
  if (err.status === 422 && err.code === 'VALIDATION_ERROR' && isBugOn('wrong-status-code')) {
    err = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong');
  }
  for (const [k, v] of Object.entries(err.headers)) res.setHeader(k, v);
  res.locals.error = { code: err.code, message: err.message };
  const correlationId = res.getHeader(CORRELATION_HEADER) ?? null;
  res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details ?? null, correlationId } });
}

const MAX_ID = 2_147_483_647;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

interface PathMethods {
  pattern: RegExp;
  /** `{parameters}` in the path: `/orders/bulk-status` (0) is more specific than `/orders/{id}` (1). */
  params: number;
  methods: string[];
}

/** The methods the OpenAPI file lists for each path. Paths outside /api/v1 are listed with their own prefix. */
function methodTable(spec: Record<string, any>, testHooks: boolean): PathMethods[] {
  return Object.entries<Record<string, unknown>>(spec.paths ?? {})
    .filter(([p]) => testHooks || !p.startsWith('/test'))
    .map(([p, item]) => {
      const full = /^\/(test|pay|metrics)/.test(p) ? p : `/api/v1${p}`;
      const pattern = full.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+');
      return {
        pattern: new RegExp(`^${pattern}/?$`),
        params: (p.match(/\{/g) ?? []).length,
        methods: METHODS.filter((m) => m in item).map((m) => m.toUpperCase()),
      };
    });
}

/** What the OpenAPI file allows on this path, from its most specific match; empty when the path is not in the file. */
function allowedMethods(table: PathMethods[], path: string): string[] {
  const hits = table.filter((t) => t.pattern.test(path));
  if (!hits.length) return [];
  const fewest = Math.min(...hits.map((h) => h.params));
  return [...new Set(hits.filter((h) => h.params === fewest).flatMap((h) => h.methods))];
}

/** `OPTIONS` answers with exactly the methods the OpenAPI file lists (plus HEAD for GET), not whatever the routers happen to match. */
export function createOptionsHandler(spec: Record<string, unknown>, testHooks: boolean): RequestHandler {
  const table = methodTable(spec, testHooks);
  return (req, res, next) => {
    // A CORS preflight asks about one method; it is not a question about the resource.
    if (req.method !== 'OPTIONS' || req.headers['access-control-request-method']) return next();
    const allowed = allowedMethods(table, req.path);
    if (!allowed.length) return next();
    const header = [...allowed, ...(allowed.includes('GET') ? ['HEAD'] : [])].sort().join(', ');
    res.setHeader('Allow', header);
    res.status(200).type('text/plain').send(header);
  };
}

function methodNotAllowed(res: Parameters<RequestHandler>[1], method: string, path: string, allowed: string[]) {
  sendError(
    res,
    new ApiError(405, 'METHOD_NOT_ALLOWED', `${method} is not allowed on ${path}`, { allowed }, { Allow: allowed.join(', ') }),
  );
}

/**
 * 405 with `Allow` for a method the OpenAPI file does not list on a /api/v1 path it does. This runs before the routers, so a path
 * like /orders/bulk-status is not caught by /orders/{id}, and an unlisted method is refused before the login check.
 */
export function createMethodGuard(spec: Record<string, unknown>, testHooks: boolean): RequestHandler {
  const table = methodTable(spec, testHooks);
  return (req, res, next) => {
    if (!req.path.startsWith('/api/v1/')) return next();
    // An id above the largest integer the database holds cannot exist (PLS-26.7); looking it up would be a 500.
    if (req.path.split('/').some((seg) => /^\d+$/.test(seg) && Number(seg) > MAX_ID)) {
      return sendError(res, new ApiError(404, 'NOT_FOUND', 'Not found'));
    }
    if (req.method === 'OPTIONS' || req.method === 'HEAD') return next();
    const allowed = allowedMethods(table, req.path);
    if (allowed.length && !allowed.includes(req.method)) return methodNotAllowed(res, req.method, req.path, allowed);
    next();
  };
}

/** 404 for a path nothing serves; 405 with `Allow` for the other paths (/test, /pay) when the method is not listed. */
export function createNotFoundHandler(spec: Record<string, unknown>, testHooks: boolean): RequestHandler {
  const table = methodTable(spec, testHooks);
  return (req, res) => {
    if (req.method !== 'OPTIONS' && req.method !== 'HEAD') {
      const allowed = allowedMethods(table, req.path);
      if (allowed.length && !allowed.includes(req.method)) return methodNotAllowed(res, req.method, req.path, allowed);
    }
    sendError(res, new ApiError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
  };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) return sendError(res, err);
  if (err instanceof ZodError) {
    return sendError(res, new ApiError(422, 'VALIDATION_ERROR', 'Validation failed', zodDetails(err)));
  }
  // Malformed JSON bodies from express.json()
  if (err?.type === 'entity.parse.failed') {
    return sendError(res, new ApiError(400, 'BAD_REQUEST', 'Request body is not valid JSON'));
  }
  if (err?.type === 'entity.too.large') {
    return sendError(res, new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'));
  }
  logger.error({ correlationId: res.getHeader(CORRELATION_HEADER), err }, 'Unhandled error');
  // verbose-errors: the 500 shows what a developer would see, including the stack (file paths) and the SQL (PLS-24.12).
  const leaked = isBugOn('verbose-errors') ? { name: err?.name, message: err?.message, stack: err?.stack, query: err?.query } : undefined;
  sendError(res, new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong', leaked));
};

export function zodDetails(err: ZodError) {
  return zod3Issues(err.issues).map((i) => ({ field: i.path.join('.'), message: i.message }));
}
