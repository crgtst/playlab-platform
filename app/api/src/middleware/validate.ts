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

const INT_LIMIT = 2_147_483_647;

/** Finds the first value the database cannot store: a string with a NUL character, or a number beyond a 32-bit integer. */
function findUnstorable(value: unknown, path: string): { field: string; message: string } | null {
  if (typeof value === 'string') return value.includes('\u0000') ? { field: path, message: 'Must not contain null characters' } : null;
  // Every number column is an integer, so no valid field holds a number this large (a product id of 53287031635 was a 500).
  if (typeof value === 'number')
    return Math.abs(value) > INT_LIMIT ? { field: path, message: `Must be between -${INT_LIMIT} and ${INT_LIMIT}` } : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findUnstorable(value[i], path ? `${path}.${i}` : String(i));
      if (found) return found;
    }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const found = findUnstorable(v, path ? `${path}.${k}` : k);
      if (found) return found;
    }
  }
  return null;
}

/** 422 for a value the database cannot store, anywhere in the JSON body or the query string (PLS-26.2: no request may cause a 500). */
export function rejectUnstorableValues(req: { body?: unknown; query?: unknown }, _res: unknown, next: (err?: unknown) => void) {
  const bad = findUnstorable(req.body, '') ?? findUnstorable(req.query, '');
  if (bad) return next(validationError([{ field: bad.field || 'body', message: bad.message }]));
  next();
}
