import { z } from '../lib/zod';
import { validationError } from '../lib/errors';
import { zodDetails } from './errorHandler';

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw validationError(zodDetails(result.error));
  return result.data;
}

/** Wraps async route handlers so rejected promises reach the error handler. */
export function asyncHandler<Req = any, Res = any>(fn: (req: Req, res: Res, next: (err?: unknown) => void) => Promise<unknown>) {
  return (req: Req, res: Res, next: (err?: unknown) => void) => {
    fn(req, res, next).catch(next);
  };
}

/** Finds the first string with a NUL character, which Postgres cannot store: it would be a 500 instead of a 422. */
function findNullCharacter(value: unknown, path: string): string | null {
  if (typeof value === 'string') return value.includes('\u0000') ? path : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findNullCharacter(value[i], `${path}.${i}`);
      if (found) return found;
    }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const found = findNullCharacter(v, path ? `${path}.${k}` : k);
      if (found) return found;
    }
  }
  return null;
}

/** 422 for a NUL character anywhere in the JSON body or the query string (PLS-26.2: no request may cause a 500). */
export function rejectNullCharacters(req: { body?: unknown; query?: unknown }, _res: unknown, next: (err?: unknown) => void) {
  const field = findNullCharacter(req.body, '') ?? findNullCharacter(req.query, '');
  if (field !== null) {
    return next(validationError([{ field: field || 'body', message: 'Must not contain null characters' }]));
  }
  next();
}
