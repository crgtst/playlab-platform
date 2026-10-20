import { NextFunction, Request, Response } from 'express';

/** Authenticated responses must never be served from the browser cache (see PLS-1.4). */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
