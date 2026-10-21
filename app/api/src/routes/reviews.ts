import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { clock } from '../lib/clock';
import { conflict, notFound } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, parse } from '../middleware/validate';

/** Mounted at /products/:productId/reviews. Text is stored and returned as-is; clients must render it as text. */
export const reviewsRouter = Router({ mergeParams: true });

const reviewSchema = z.object({
  rating: z
    .number({ required_error: 'Choose a rating' })
    .int('Rating must be a whole number')
    .min(1, 'Rating must be 1 to 5')
    .max(5, 'Rating must be 1 to 5'),
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, 'Title is required')
    .max(100, 'Title must be at most 100 characters'),
  body: z.string().trim().max(1000, 'Review must be at most 1000 characters').optional().default(''),
});

function reviewView(r: any) {
  return {
    id: r.id,
    productId: r.product_id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    author: { id: r.user_id, name: r.author_name },
    createdAt: r.created_at,
  };
}

async function productId(req: Request): Promise<number> {
  const id = Number(req.params.productId);
  if (!Number.isInteger(id) || id <= 0) throw notFound('Product not found');
  const rows = await query('SELECT 1 FROM products WHERE id = $1', [id]);
  if (!rows.length) throw notFound('Product not found');
  return id;
}

async function listReviews(id: number) {
  const rows = await query(
    `SELECT r.*, u.name AS author_name FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.product_id = $1 ORDER BY r.created_at DESC, r.id DESC`,
    [id],
  );
  const average = rows.length ? Math.round((rows.reduce((s: number, r: any) => s + r.rating, 0) / rows.length) * 10) / 10 : null;
  return { data: rows.map(reviewView), meta: { count: rows.length, average } };
}

reviewsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await listReviews(await productId(req)));
  }),
);

reviewsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = await productId(req);
    const body = parse(reviewSchema, req.body);
    const rows = await query(
      `INSERT INTO reviews (product_id, user_id, rating, title, body, created_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (product_id, user_id) DO NOTHING RETURNING id`,
      [id, req.user!.id, body.rating, body.title, body.body, clock.now()],
    );
    if (!rows.length) throw conflict('ALREADY_REVIEWED', 'You have already reviewed this product');
    const list = await listReviews(id);
    res.status(201).json({ data: list.data.find((r) => r.id === rows[0].id), meta: list.meta });
  }),
);
