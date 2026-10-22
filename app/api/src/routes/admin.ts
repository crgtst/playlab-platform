import { Request, Response, Router } from 'express';
import { z } from '../lib/zod';
import { query } from '../db/pool';
import { clock } from '../lib/clock';
import { notFound } from '../lib/errors';
import { requireRole } from '../middleware/auth';
import { noStore } from '../middleware/noStore';
import { asyncHandler, parse } from '../middleware/validate';
import { publicUser, SELECT_USER, UserRow } from './auth';

/** /api/v1/admin: user administration (PLS-23). Support can read; only admins can change anything. */
export const adminRouter = Router();
adminRouter.use(noStore);

const ROLES = ['customer', 'admin', 'support'] as const;

type AdminUserRow = UserRow & { deleted_at: Date | null };

function adminUserView(u: AdminUserRow) {
  const locked = !!u.locked_until && u.locked_until > clock.now();
  return {
    ...publicUser(u),
    failedLogins: u.failed_logins,
    locked,
    lockedUntil: locked ? u.locked_until : null,
    deletedAt: u.deleted_at,
  };
}

const listSchema = z.object({
  role: z.enum(ROLES, { error: `Role must be one of: ${ROLES.join(', ')}` }).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

adminRouter.get(
  '/users',
  requireRole('admin', 'support'),
  asyncHandler(async (req: Request, res: Response) => {
    const q = parse(listSchema, req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.role) {
      params.push(q.role);
      where.push(`u.role = $${params.length}`);
    }
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [{ n }] = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM users u ${filter}`, params);
    const rows = await query<AdminUserRow>(
      `${SELECT_USER} ${filter} ORDER BY u.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.limit, (q.page - 1) * q.limit],
    );
    res.setHeader('X-Total-Count', String(n));
    res.json({ data: rows.map(adminUserView), meta: { page: q.page, limit: q.limit, total: n, totalPages: Math.ceil(n / q.limit) } });
  }),
);

const changeSchema = z
  .object({
    role: z.enum(ROLES, { error: `Role must be one of: ${ROLES.join(', ')}` }).optional(),
    unlock: z.literal(true, { error: 'unlock can only be true' }).optional(),
  })
  .refine((b) => b.role !== undefined || b.unlock !== undefined, { message: 'Send a role, or unlock: true', path: ['role'] });

/**
 * Changes a user's role or unlocks their account (PLS-23.2, 23.3). A new role takes effect from the user's next login:
 * access tokens already issued keep the old role until they expire.
 */
adminRouter.patch(
  '/users/:id',
  requireRole('admin'),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('User not found');
    const body = parse(changeSchema, req.body);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.role) {
      params.push(body.role);
      sets.push(`role = $${params.length}`);
    }
    if (body.unlock) sets.push('failed_logins = 0', 'locked_until = NULL');
    params.push(id);
    const updated = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`, params);
    if (!updated[0]) throw notFound('User not found');
    const [user] = await query<AdminUserRow>(`${SELECT_USER} WHERE u.id = $1`, [id]);
    res.json({ data: adminUserView(user) });
  }),
);
