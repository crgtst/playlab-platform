import { Request, Response, Router, NextFunction } from 'express';
import multer from 'multer';
import { query } from '../db/pool';
import { isBugOn } from '../lib/bugs';
import { clock } from '../lib/clock';
import { ApiError, notFound } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { noStore } from '../middleware/noStore';
import { asyncHandler } from '../middleware/validate';

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
      return next(new ApiError(422, 'VALIDATION_ERROR', 'Upload one file in the "avatar" field', [{ field: 'avatar', message: err.message }]));
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
    if (!file) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose an image to upload', [{ field: 'avatar', message: 'Choose an image to upload' }]);
    // upload-extension-only: trust the file name instead of the file's contents.
    const type = isBugOn('upload-extension-only') ? typeFromExtension(file.originalname) : sniffImageType(file.buffer);
    if (!type) {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only PNG or JPG images are allowed', { receivedName: file.originalname });
    }
    const rows = await query<{ updated_at: Date }>(
      `INSERT INTO avatars (user_id, content_type, data, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
       RETURNING updated_at`,
      [req.user!.id, type, file.buffer, clock.now()],
    );
    res.status(201).json({ data: { avatarUrl: avatarUrl(req.user!.id, rows[0].updated_at), contentType: type, sizeBytes: file.size } });
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
