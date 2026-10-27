import { Router } from 'express';
import { query } from '../db/pool';
import { isBugOn } from '../lib/bugs';
import { asyncHandler } from '../middleware/validate';

/**
 * The retired API version. Normally nothing answers here, so /api/v0/orders is a 404 (PLS-24.13). With shadow-api-v0 on,
 * the old route is still switched on: it needs no login and lists every order with its customer's email.
 */
export const legacyRouter = Router();

legacyRouter.get(
  '/orders',
  asyncHandler(async (_req: unknown, res: { json: (body: unknown) => void }, next: (err?: unknown) => void) => {
    if (!isBugOn('shadow-api-v0')) return next();
    const rows = await query(
      `SELECT o.id, o.number, o.status, o.total_cents AS "totalCents", u.email AS "customerEmail", u.name AS "customerName"
         FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id`,
    );
    res.json({ orders: rows });
  }),
);
