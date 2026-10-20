import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { isBugOn } from './bugs';
import { clock } from './clock';

export type Role = 'customer' | 'admin' | 'support';

export interface AccessClaims {
  sub: string;
  role: Role;
  name: string;
  email: string;
  iat: number;
  exp: number;
}

export function signAccessToken(user: { id: number; role: Role; name: string; email: string }): string {
  const iat = clock.nowSec();
  return jwt.sign(
    { sub: String(user.id), role: user.role, name: user.name, email: user.email, iat, exp: iat + config.accessTokenTtlSec },
    config.jwtSecret,
    { algorithm: 'HS256' },
  );
}

/** Throws jwt errors (TokenExpiredError, JsonWebTokenError) on failure. */
export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
    clockTimestamp: clock.nowSec(),
    ignoreExpiration: isBugOn('token-never-expires'),
  }) as unknown as AccessClaims;
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
