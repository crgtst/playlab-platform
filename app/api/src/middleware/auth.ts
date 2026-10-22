import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool';
import { ApiError, forbidden, unauthorized } from '../lib/errors';
import { AccessClaims, Role, verifyAccessToken } from '../lib/tokens';

export const SESSION_COOKIE = 'session';
export const REFRESH_COOKIE = 'refresh_token';
export const CART_COOKIE = 'cart_id';

export interface AuthUser {
  id: number;
  role: Role;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[SESSION_COOKIE] ?? null;
}

function toUser(claims: AccessClaims): AuthUser {
  return { id: Number(claims.sub), role: claims.role, name: claims.name, email: claims.email };
}

/**
 * Attaches req.user when a valid token is present. Invalid or expired tokens give 401 even on optional routes, and so
 * does a token for a deleted account or one issued before its sessions were ended (PLS-22.4).
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next();
  let claims: AccessClaims;
  try {
    claims = verifyAccessToken(token);
  } catch (err) {
    return next(tokenError(err));
  }
  try {
    const [user] = await query<{ token_version: number; deleted_at: Date | null }>(
      'SELECT token_version, deleted_at FROM users WHERE id = $1',
      [Number(claims.sub)],
    );
    if (!user || user.deleted_at || (claims.ver ?? 1) !== user.token_version) {
      return next(unauthorized('This session has ended. Log in again.', 'TOKEN_REVOKED'));
    }
    req.user = toUser(claims);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  optionalAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!req.user) return next(unauthorized());
    next();
  });
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    requireAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (!roles.includes(req.user!.role)) return next(forbidden());
      next();
    });
  };
}

function tokenError(err: unknown): ApiError {
  if (err instanceof jwt.TokenExpiredError) return unauthorized('Access token has expired', 'TOKEN_EXPIRED');
  return unauthorized('Access token is invalid', 'TOKEN_INVALID');
}
