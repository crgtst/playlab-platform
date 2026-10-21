import { Request, Response, Router } from 'express';
import { query } from '../db/pool';
import { clock } from '../lib/clock';
import { asyncHandler } from '../middleware/validate';

export const offersRouter = Router();

/** Public, currently active discount codes for the "Current offers" strip. */
offersRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const now = clock.now();
    const rows = await query(
      `SELECT code, description, type, value, min_spend_cents FROM discount_codes
        WHERE public AND (starts_at IS NULL OR starts_at <= $1) AND (expires_at IS NULL OR expires_at > $1)
          AND NOT (single_use AND used_count > 0)
        ORDER BY code DESC`,
      [now],
    );
    res.json({
      data: rows.map((r: any) => ({
        code: r.code,
        description: r.description,
        type: r.type,
        value: r.value,
        minSpendCents: r.min_spend_cents,
      })),
    });
  }),
);
