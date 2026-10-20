import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
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

/** Attaches req.user when a valid token is present. Invalid or expired tokens give 401 even on optional routes. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = toUser(verifyAccessToken(token));
    next();
  } catch (err) {
    next(tokenError(err));
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
