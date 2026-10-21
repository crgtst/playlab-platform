import { z, ZodTypeAny } from 'zod';
import { validationError } from '../lib/errors';
import { zodDetails } from './errorHandler';

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
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
