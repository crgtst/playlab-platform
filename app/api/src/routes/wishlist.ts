import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool';
import { clock } from '../lib/clock';
import { ApiError, conflict, notFound } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { noStore } from '../middleware/noStore';
import { asyncHandler, parse } from '../middleware/validate';
import { productView } from './products';

export const wishlistRouter = Router();
wishlistRouter.use(noStore, requireAuth);

const addSchema = z.object({ productId: z.number({ required_error: 'productId is required' }).int().positive() });
const orderSchema = z.object({
  productIds: z.array(z.number().int().positive()).max(500).refine((ids) => new Set(ids).size === ids.length, 'productIds must not repeat'),
});

async function wishlistView(userId: number) {
  const rows = await query(
    `SELECT w.position, w.added_at, p.*, c.slug AS category_slug, c.name AS category_name
       FROM wishlist_items w JOIN products p ON p.id = w.product_id JOIN categories c ON c.id = p.category_id
      WHERE w.user_id = $1 ORDER BY w.position, w.added_at`,
    [userId],
  );
  return {
    data: rows.map((r: any, i: number) => ({ position: i, addedAt: r.added_at, product: productView(r) })),
    meta: { count: rows.length },
  };
}

wishlistRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await wishlistView(req.user!.id));
  }),
);

wishlistRouter.post(
  '/items',
  asyncHandler(async (req: Request, res: Response) => {
    const { productId } = parse(addSchema, req.body);
    const userId = req.user!.id;
    await withTransaction(async (client) => {
      const p = await client.query('SELECT 1 FROM products WHERE id = $1', [productId]);
      if (!p.rowCount) throw notFound('Product not found');
      const max = await client.query('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM wishlist_items WHERE user_id = $1', [userId]);
      const r = await client.query(
        `INSERT INTO wishlist_items (user_id, product_id, position, added_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [userId, productId, max.rows[0].next, clock.now()],
      );
      if (!r.rowCount) throw conflict('ALREADY_IN_WISHLIST', 'This product is already in your wishlist');
    });
    res.status(201).json(await wishlistView(userId));
  }),
);

wishlistRouter.delete(
  '/items/:productId',
  asyncHandler(async (req: Request, res: Response) => {
    const rows = await query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2 RETURNING product_id', [
      req.user!.id,
      Number(req.params.productId) || 0,
    ]);
    if (!rows.length) throw notFound('This product is not in your wishlist');
    res.json(await wishlistView(req.user!.id));
  }),
);

wishlistRouter.put(
  '/order',
  asyncHandler(async (req: Request, res: Response) => {
    const { productIds } = parse(orderSchema, req.body);
    const userId = req.user!.id;
    await withTransaction(async (client) => {
      const current = await client.query('SELECT product_id FROM wishlist_items WHERE user_id = $1 FOR UPDATE', [userId]);
      const have = new Set(current.rows.map((r: any) => r.product_id));
      if (have.size !== productIds.length || productIds.some((id) => !have.has(id))) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'productIds must list exactly the products in your wishlist', [
          { field: 'productIds', message: 'productIds must list exactly the products in your wishlist' },
        ]);
      }
      for (let i = 0; i < productIds.length; i++) {
        await client.query('UPDATE wishlist_items SET position = $1 WHERE user_id = $2 AND product_id = $3', [i, userId, productIds[i]]);
      }
    });
    res.json(await wishlistView(userId));
  }),
);
