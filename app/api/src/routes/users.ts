import bcrypt from 'bcryptjs';
import { Request, Response, Router, NextFunction } from 'express';
import multer from 'multer';
import { z } from '../lib/zod';
import { config } from '../config';
import { BlockedAddressError, FetchFailedError, TooLargeError, safeFetch } from '../lib/safeFetch';
import { query, withTransaction } from '../db/pool';
import { isBugOn } from '../lib/bugs';
import { clock } from '../lib/clock';
import { ApiError, conflict, notFound, validationError } from '../lib/errors';
import { randomToken } from '../lib/tokens';
import { requireAuth } from '../middleware/auth';
import { noStore } from '../middleware/noStore';
import { asyncHandler, parse } from '../middleware/validate';
import { clearSessionCookies, email, nameField, publicUser, SELECT_USER, UserRow } from './auth';

export const usersRouter = Router();

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } });

/** Detects the real type from the file's first bytes. Extensions and the browser's MIME type are not trusted. */
export function sniffImageType(buf: Buffer): 'image/png' | 'image/jpeg' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

function typeFromExtension(name: string): 'image/png' | 'image/jpeg' | null {
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  return null;
}

export function avatarUrl(userId: number, updatedAt: Date | null | undefined): string | null {
  return updatedAt ? `/api/v1/users/${userId}/avatar?v=${new Date(updatedAt).getTime()}` : null;
}

function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('avatar')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(413, 'FILE_TOO_LARGE', 'File too large', { maxBytes: AVATAR_MAX_BYTES }));
      }
      return next(
        new ApiError(422, 'VALIDATION_ERROR', 'Upload one file in the "avatar" field', [{ field: 'avatar', message: err.message }]),
      );
    }
    next(err);
  });
}

usersRouter.post(
  '/me/avatar',
  noStore,
  requireAuth,
  handleUpload,
  asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file)
      throw new ApiError(422, 'VALIDATION_ERROR', 'Choose an image to upload', [{ field: 'avatar', message: 'Choose an image to upload' }]);
    // upload-extension-only: trust the file name instead of the file's contents.
    const type = isBugOn('upload-extension-only') ? typeFromExtension(file.originalname) : sniffImageType(file.buffer);
    if (!type) {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only PNG or JPG images are allowed', { receivedName: file.originalname });
    }
    res.status(201).json(await storeAvatar(req.user!.id, file.buffer, type));
  }),
);

/** Saves an avatar (replacing any earlier one) and returns the 201 body. */
async function storeAvatar(userId: number, data: Buffer, type: 'image/png' | 'image/jpeg') {
  const rows = await query<{ updated_at: Date }>(
    `INSERT INTO avatars (user_id, content_type, data, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
     RETURNING updated_at`,
    [userId, type, data, clock.now()],
  );
  return { data: { avatarUrl: avatarUrl(userId, rows[0].updated_at), contentType: type, sizeBytes: data.length } };
}

const importSchema = z.object({ url: z.string('url is required').trim().min(1, 'url is required').max(2048) });

/**
 * Imports the avatar from a URL (PLS-9.5). Only public http(s) addresses are fetched: loopback, private, link-local and
 * cloud-metadata addresses are refused before any request is made (PLS-24.10, OWASP API7). The ssrf-avatar-url defect
 * fetches anything.
 */
usersRouter.post(
  '/me/avatar/import',
  noStore,
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { url: raw } = parse(importSchema, req.body);
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw validationError([{ field: 'url', message: 'Enter a full address, such as https://example.com/me.png' }]);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw validationError([{ field: 'url', message: 'Use an http or https address' }]);
    }
    let fetched: { body: Buffer };
    try {
      fetched = await safeFetch(url, {
        maxBytes: AVATAR_MAX_BYTES,
        timeoutMs: 5000,
        allowedHosts: config.avatarImportAllowedHosts,
        checkAddresses: !isBugOn('ssrf-avatar-url'),
      });
    } catch (err) {
      if (err instanceof BlockedAddressError) throw validationError([{ field: 'url', message: 'That address is not allowed' }]);
      if (err instanceof TooLargeError) throw new ApiError(413, 'FILE_TOO_LARGE', 'File too large', { maxBytes: AVATAR_MAX_BYTES });
      if (err instanceof FetchFailedError) throw validationError([{ field: 'url', message: 'Could not fetch an image from that address' }]);
      throw err;
    }
    const type = sniffImageType(fetched.body);
    if (!type) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only PNG or JPG images are allowed', { receivedName: url.pathname });
    res.status(201).json(await storeAvatar(req.user!.id, fetched.body, type));
  }),
);

usersRouter.delete(
  '/me/avatar',
  noStore,
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    await query('DELETE FROM avatars WHERE user_id = $1', [req.user!.id]);
    res.status(204).end();
  }),
);

usersRouter.get(
  '/:id/avatar',
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('Avatar not found');
    const rows = await query('SELECT content_type, data, updated_at FROM avatars WHERE user_id = $1', [id]);
    if (!rows[0]) throw notFound('Avatar not found');
    const etag = `"av-${id}-${new Date(rows[0].updated_at).getTime()}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.type(rows[0].content_type).send(rows[0].data);
  }),
);

// ---------- account management (PLS-22) ----------

// Built per request: auth.ts imports this module, so its exports aren't ready while this one first loads.
const profileSchema = () =>
  z
    .object({ name: nameField.optional(), email: email.optional(), currentPassword: z.string().optional() })
    .refine((b) => b.name !== undefined || b.email !== undefined, { message: 'Send a new name or email', path: ['name'] });

async function loadUser(id: number): Promise<UserRow> {
  const rows = await query<UserRow>(`${SELECT_USER} WHERE u.id = $1`, [id]);
  return rows[0];
}

usersRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: publicUser(await loadUser(req.user!.id)) });
  }),
);

/** Change your name, or your email with your current password (PLS-22.1 to 22.3, 22.6). Other fields are ignored. */
usersRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(profileSchema(), req.body);
    const id = req.user!.id;
    await withTransaction(async (client) => {
      const current = (await client.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
      const newEmail = body.email !== undefined && body.email !== current.email ? body.email : undefined;
      if (newEmail) {
        if (!body.currentPassword) {
          throw validationError([{ field: 'currentPassword', message: 'Enter your current password to change your email' }]);
        }
        if (!(await bcrypt.compare(body.currentPassword, current.password_hash))) {
          throw validationError([{ field: 'currentPassword', message: 'Current password is incorrect' }]);
        }
        const taken = await client.query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [newEmail, id]);
        if (taken.rowCount) throw conflict('EMAIL_IN_USE', 'An account with this email already exists');
      }
      await client.query('UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3', [
        body.name ?? null,
        newEmail ?? null,
        id,
      ]);
    });
    res.json({ data: publicUser(await loadUser(id)) });
  }),
);

/**
 * Deletes your account (PLS-22.4, 22.5): the user is anonymised rather than removed, so orders stay for the shop's
 * records; personal data (avatar, cart, wishlist, email links, mailbox) is removed; every refresh token is revoked; and
 * bumping token_version makes every access token already issued return 401.
 */
usersRouter.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.user!.id;
    const unusable = await bcrypt.hash(randomToken(), 4);
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ email: string }>('SELECT email FROM users WHERE id = $1 FOR UPDATE', [id]);
      await client.query(
        `UPDATE users SET name = 'Deleted user', email = $1, password_hash = $2, email_verified = FALSE, failed_logins = 0,
                locked_until = NULL, deleted_at = $3, token_version = token_version + 1
          WHERE id = $4`,
        [`deleted-${id}@playlab.invalid`, unusable, clock.now(), id],
      );
      await client.query('UPDATE refresh_tokens SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL', [clock.now(), id]);
      for (const table of ['avatars', 'wishlist_items', 'carts', 'email_tokens']) {
        await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [id]);
      }
      await client.query('DELETE FROM mailbox WHERE to_email = $1', [rows[0].email]);
    });
    clearSessionCookies(res);
    res.status(204).end();
  }),
);
