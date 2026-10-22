import bcrypt from 'bcryptjs';
import { Request, Response, Router } from 'express';
import { typeErrors, z } from '../lib/zod';
import { config } from '../config';
import { pool, query, withTransaction } from '../db/pool';
import { clock } from '../lib/clock';
import { ApiError, conflict, unauthorized } from '../lib/errors';
import { sendEmail } from '../lib/mailer';
import { hashToken, randomToken, Role, signAccessToken } from '../lib/tokens';
import { CART_COOKIE, REFRESH_COOKIE, requireAuth, SESSION_COOKIE } from '../middleware/auth';
import { noStore } from '../middleware/noStore';
import { asyncHandler, parse } from '../middleware/validate';
import { mergeGuestCart } from '../services/cart';
import { avatarUrl } from './users';
import { isBugOn } from '../lib/bugs';

export const authRouter = Router();
authRouter.use(noStore);

export interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
  email_verified: boolean;
  failed_logins: number;
  locked_until: Date | null;
  created_at: Date;
  avatar_updated_at?: Date | null;
}

export const SELECT_USER = 'SELECT u.*, a.updated_at AS avatar_updated_at FROM users u LEFT JOIN avatars a ON a.user_id = u.id';

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    emailVerified: u.email_verified,
    avatarUrl: avatarUrl(u.id, u.avatar_updated_at),
    createdAt: u.created_at,
  };
}

export const email = z
  .string(typeErrors({ required: 'Email is required' }))
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254);
const password = z
  .string(typeErrors({ required: 'Password is required' }))
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');
const name = z
  .string(typeErrors({ required: 'Name is required' }))
  .trim()
  .min(1, 'Name is required')
  .max(500, 'Name must be at most 500 characters');

/** The name rule without any defect, for profile changes (fada-rejected affects registration only, PLS-2.3). */
export const nameField = name;
// fada-rejected: an "ASCII letters only" rule that wrongly rejects names like Seán or Aoife Ní Bhriain.
const registerSchema = () =>
  z.object({
    name: isBugOn('fada-rejected') ? name.pipe(z.string().regex(/^[A-Za-z .'-]+$/, 'Name contains invalid characters')) : name,
    email,
    password,
  });
const loginSchema = z.object({
  email: z
    .string(typeErrors({ required: 'Email is required' }))
    .trim()
    .toLowerCase()
    .min(1, 'Email is required'),
  password: z.string(typeErrors({ required: 'Password is required' })).min(1, 'Password is required'),
});
const tokenSchema = z.object({ token: z.string().min(1, 'Token is required') });
const resetSchema = z.object({ token: z.string().min(1, 'Token is required'), password });
const forgotSchema = z.object({ email });

async function issueSession(res: Response, user: UserRow, db: { query: typeof pool.query } = pool) {
  const accessToken = signAccessToken(user);
  const refreshToken = randomToken();
  const expiresAt = new Date(clock.nowMs() + config.refreshTokenTtlSec * 1000);
  await db.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    user.id,
    hashToken(refreshToken),
    expiresAt,
  ]);
  res.cookie(SESSION_COOKIE, accessToken, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: config.refreshTokenTtlSec * 1000,
  });
  return { accessToken, refreshToken, expiresIn: config.accessTokenTtlSec, tokenType: 'Bearer' as const };
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.clearCookie(CART_COOKIE, { path: '/' });
}

authRouter.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(registerSchema(), req.body);
    const hash = await bcrypt.hash(body.password, 10);
    const user = await withTransaction(async (client) => {
      const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [body.email]);
      if (existing.rowCount) throw conflict('EMAIL_IN_USE', 'An account with this email already exists');
      const rows = await client.query<UserRow>(
        `INSERT INTO users (email, name, password_hash, created_at) VALUES ($1, $2, $3, $4) RETURNING *`,
        [body.email, body.name, hash, clock.now()],
      );
      const created = rows.rows[0];
      const token = randomToken();
      await client.query(`INSERT INTO email_tokens (user_id, type, token_hash, expires_at) VALUES ($1, 'confirm', $2, $3)`, [
        created.id,
        hashToken(token),
        new Date(clock.nowMs() + config.confirmLinkTtlSec * 1000),
      ]);
      const link = `${config.publicWebUrl}/confirm-email?token=${token}`;
      await sendEmail(
        {
          to: created.email,
          type: 'confirm-email',
          subject: 'Confirm your PlayLab Shop account',
          body: `Hi ${created.name},\n\nThanks for registering. Confirm your email address by opening this link:\n${link}\n`,
          link,
        },
        client,
      );
      return created;
    });
    res.status(201).json({ user: publicUser(user) });
  }),
);

authRouter.post(
  '/confirm-email',
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = parse(tokenSchema, req.body);
    const user = await withTransaction(async (client) => {
      const rows = await client.query(`SELECT * FROM email_tokens WHERE token_hash = $1 AND type = 'confirm' FOR UPDATE`, [
        hashToken(token),
      ]);
      const t = rows.rows[0];
      if (!t || t.used_at) throw new ApiError(400, 'CONFIRM_TOKEN_INVALID', 'This confirmation link is invalid or has already been used');
      if (t.expires_at <= clock.now()) throw new ApiError(400, 'CONFIRM_TOKEN_EXPIRED', 'This confirmation link has expired');
      await client.query('UPDATE email_tokens SET used_at = $1 WHERE id = $2', [clock.now(), t.id]);
      const u = await client.query<UserRow>('UPDATE users SET email_verified = TRUE WHERE id = $1 RETURNING *', [t.user_id]);
      return u.rows[0];
    });
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(loginSchema, req.body);
    const rows = await query<UserRow>(`${SELECT_USER} WHERE u.email = $1`, [body.email]);
    const user = rows[0];
    const badCredentials = new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    if (!user) throw badCredentials;

    const now = clock.now();
    if (user.locked_until && user.locked_until > now) {
      const retryAfter = Math.ceil((user.locked_until.getTime() - now.getTime()) / 1000);
      throw new ApiError(
        423,
        'ACCOUNT_LOCKED',
        'Your account is locked after too many failed attempts. Try again in 15 minutes.',
        { lockedUntil: user.locked_until.toISOString() },
        { 'Retry-After': String(retryAfter) },
      );
    }

    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) {
      const failed = (user.locked_until ? 0 : user.failed_logins) + 1;
      const lockedUntil = failed >= config.lockoutThreshold ? new Date(now.getTime() + config.lockoutMinutes * 60_000) : null;
      await query('UPDATE users SET failed_logins = $1, locked_until = $2 WHERE id = $3', [lockedUntil ? 0 : failed, lockedUntil, user.id]);
      throw badCredentials;
    }

    const session = await withTransaction(async (client) => {
      await client.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
      await mergeGuestCart(req.cookies?.[CART_COOKIE], user.id, client);
      return issueSession(res, user, client);
    });
    res.clearCookie(CART_COOKIE, { path: '/' });
    res.json({ ...session, user: publicUser({ ...user, failed_logins: 0, locked_until: null }) });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const token: string | undefined = req.body?.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('Refresh token is missing', 'REFRESH_TOKEN_MISSING');
    const result = await withTransaction(async (client) => {
      const rows = await client.query('SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE', [hashToken(token)]);
      const t = rows.rows[0];
      if (!t || t.revoked_at) throw unauthorized('Refresh token is invalid', 'REFRESH_TOKEN_INVALID');
      if (t.expires_at <= clock.now()) throw unauthorized('Refresh token has expired', 'REFRESH_TOKEN_EXPIRED');
      await client.query('UPDATE refresh_tokens SET revoked_at = $1 WHERE id = $2', [clock.now(), t.id]);
      const u = await client.query<UserRow>('SELECT * FROM users WHERE id = $1', [t.user_id]);
      if (!u.rows[0]) throw unauthorized('Refresh token is invalid', 'REFRESH_TOKEN_INVALID');
      const session = await issueSession(res, u.rows[0], client);
      return { ...session, user: publicUser(u.rows[0]) };
    });
    res.json(result);
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    // logout-incomplete: report success but leave the session cookie and refresh token working.
    if (isBugOn('logout-incomplete')) return res.status(204).end();
    const token: string | undefined = req.body?.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await query('UPDATE refresh_tokens SET revoked_at = $1 WHERE token_hash = $2 AND revoked_at IS NULL', [
        clock.now(),
        hashToken(token),
      ]);
    }
    clearSessionCookies(res);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const rows = await query<UserRow>(`${SELECT_USER} WHERE u.id = $1`, [req.user!.id]);
    if (!rows[0]) throw unauthorized();
    res.json({ user: publicUser(rows[0]) });
  }),
);

authRouter.post(
  '/forgot-password',
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(forgotSchema, req.body);
    const rows = await query<UserRow>('SELECT * FROM users WHERE email = $1', [body.email]);
    const user = rows[0];
    if (user) {
      const token = randomToken();
      await query(`INSERT INTO email_tokens (user_id, type, token_hash, expires_at) VALUES ($1, 'reset', $2, $3)`, [
        user.id,
        hashToken(token),
        new Date(clock.nowMs() + config.resetLinkTtlSec * 1000),
      ]);
      const link = `${config.publicWebUrl}/reset-password?token=${token}`;
      await sendEmail({
        to: user.email,
        type: 'password-reset',
        subject: 'Reset your PlayLab Shop password',
        body: `Hi ${user.name},\n\nUse this link to choose a new password. It expires in 1 hour.\n${link}\n`,
        link,
      });
    }
    // Same response whether or not the account exists, so emails cannot be enumerated.
    res.status(202).json({ message: 'If an account exists for that email, a reset link has been sent.' });
  }),
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(resetSchema, req.body);
    const hash = await bcrypt.hash(body.password, 10);
    await withTransaction(async (client) => {
      const rows = await client.query(`SELECT * FROM email_tokens WHERE token_hash = $1 AND type = 'reset' FOR UPDATE`, [
        hashToken(body.token),
      ]);
      const t = rows.rows[0];
      if (!t || t.used_at) throw new ApiError(400, 'RESET_TOKEN_INVALID', 'This reset link is invalid or has already been used');
      if (t.expires_at <= clock.now()) throw new ApiError(400, 'RESET_TOKEN_EXPIRED', 'This reset link has expired');
      await client.query('UPDATE email_tokens SET used_at = $1 WHERE id = $2', [clock.now(), t.id]);
      await client.query('UPDATE users SET password_hash = $1, failed_logins = 0, locked_until = NULL WHERE id = $2', [hash, t.user_id]);
      await client.query('UPDATE refresh_tokens SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL', [clock.now(), t.user_id]);
    });
    res.json({ message: 'Your password has been changed. You can now log in.' });
  }),
);
