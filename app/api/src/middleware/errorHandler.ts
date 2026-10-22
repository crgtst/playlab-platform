import { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isBugOn } from '../lib/bugs';
import { ApiError } from '../lib/errors';
import { logger } from '../lib/logger';
import { CORRELATION_HEADER } from '../lib/requestContext';

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

export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(res, new ApiError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

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
  sendError(res, new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong'));
};

export function zodDetails(err: ZodError) {
  return err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}
