import { Request } from 'express';
import { isBugOn } from './bugs';
import { ApiError } from './errors';

/**
 * Optimistic locking (PLS-21): a write must send If-Match with the ETag it last read. Missing is 428, stale is 412,
 * so two admins can never silently overwrite each other. `If-Match: *` matches any current version (RFC 9110).
 */
export function checkIfMatch(req: Request, currentEtag: string, resource: 'product' | 'order') {
  // lost-update: If-Match is ignored, so the last write wins.
  if (isBugOn('lost-update')) return;
  const header = req.get('If-Match');
  if (!header) {
    throw new ApiError(428, 'PRECONDITION_REQUIRED', `Send If-Match with the ETag from GET to change this ${resource}`);
  }
  const tags = header.split(',').map((t) => t.trim());
  if (tags.includes('*') || tags.includes(currentEtag)) return;
  throw new ApiError(412, 'PRECONDITION_FAILED', `This ${resource} was changed by someone else. Get the latest version and try again.`);
}
