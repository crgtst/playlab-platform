import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/** Per-request state that code deep in a request can read without it being passed down. */
export interface RequestContext {
  correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const CORRELATION_HEADER = 'X-Correlation-Id';
const VALID_CORRELATION_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function requestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Echoes a valid X-Correlation-Id, or generates one (PLS-25.1), and runs the rest of the request in its context. */
export function correlation(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get(CORRELATION_HEADER);
  const correlationId = incoming && VALID_CORRELATION_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(CORRELATION_HEADER, correlationId);
  storage.run({ correlationId }, next);
}
