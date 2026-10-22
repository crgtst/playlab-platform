import { Request, Response, Router } from 'express';
import { typeErrors, z } from '../lib/zod';
import { withTransaction } from '../db/pool';
import { isBugOn } from '../lib/bugs';
import { ApiError, conflict, notFound } from '../lib/errors';
import { lineTotal } from '../lib/pricing';
import { optionalAuth } from '../middleware/auth';
import { noStore } from '../middleware/noStore';
import { asyncHandler, parse } from '../middleware/validate';
import {
  assertDiscountUsable,
  buildCartView,
  findCartId,
  findDiscountByCode,
  getOrCreateCartId,
  normaliseCode,
  stockError,
} from '../services/cart';

export const cartRouter = Router();
cartRouter.use(noStore, optionalAuth);

// Built per request so the quantity-negative defect can relax the minimum.
function quantitySchema() {
  return z
    .number(typeErrors({ required: 'Quantity is required', invalid: 'Quantity must be a number' }))
    .int('Quantity must be a whole number')
    .min(isBugOn('quantity-negative') ? -99 : 1, 'Quantity must be at least 1')
    .max(99, 'Quantity must be 99 or fewer');
}

const addSchema = () =>
  z.object({
    productId: z
      .number(typeErrors({ required: 'productId is required' }))
      .int()
      .positive(),
    quantity: quantitySchema().default(1),
  });
const updateSchema = () => z.object({ quantity: quantitySchema() });

const checkStock = (wanted: number, stock: number) => {
  if (wanted > stock && !isBugOn('stock-oversell')) throw stockError(stock);
};
const discountSchema = z.object({
  code: z.string(typeErrors({ required: 'Enter a discount code' })).refine((s) => s.trim().length > 0, 'Enter a discount code'),
});
const productIdParam = z.coerce.number().int().positive();

async function lockProduct(client: import('pg').PoolClient, productId: number) {
  const rows = await client.query('SELECT id, stock, price_cents FROM products WHERE id = $1 FOR UPDATE', [productId]);
  if (!rows.rows[0]) throw notFound('Product not found');
  return rows.rows[0] as { id: number; stock: number; price_cents: number };
}

cartRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await buildCartView(await findCartId(req)));
  }),
);

cartRouter.post(
  '/items',
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(addSchema(), req.body);
    const view = await withTransaction(async (client) => {
      const product = await lockProduct(client, body.productId);
      const cartId = await getOrCreateCartId(req, res, client);
      const existing = await client.query('SELECT quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2', [
        cartId,
        body.productId,
      ]);
      const newQty = (existing.rows[0]?.quantity ?? 0) + body.quantity;
      checkStock(newQty, product.stock);
      await client.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price_cents_at_add) VALUES ($1, $2, $3, $4)
         ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
        [cartId, body.productId, newQty, product.price_cents],
      );
      await client.query('UPDATE carts SET updated_at = now() WHERE id = $1', [cartId]);
      return buildCartView(cartId, client);
    });
    res.status(201).json(view);
  }),
);

cartRouter.patch(
  '/items/:productId',
  asyncHandler(async (req: Request, res: Response) => {
    const productId = productIdParam.safeParse(req.params.productId);
    if (!productId.success) throw notFound('Item is not in your cart');
    const body = parse(updateSchema(), req.body);
    const view = await withTransaction(async (client) => {
      const cartId = await findCartId(req, client);
      if (!cartId) throw notFound('Item is not in your cart');
      const product = await lockProduct(client, productId.data);
      checkStock(body.quantity, product.stock);
      const rows = await client.query('UPDATE cart_items SET quantity = $1 WHERE cart_id = $2 AND product_id = $3 RETURNING product_id', [
        body.quantity,
        cartId,
        productId.data,
      ]);
      if (!rows.rowCount) throw notFound('Item is not in your cart');
      return buildCartView(cartId, client);
    });
    res.json(view);
  }),
);

cartRouter.delete(
  '/items/:productId',
  asyncHandler(async (req: Request, res: Response) => {
    const productId = productIdParam.safeParse(req.params.productId);
    if (!productId.success) throw notFound('Item is not in your cart');
    const view = await withTransaction(async (client) => {
      const cartId = await findCartId(req, client);
      if (!cartId) throw notFound('Item is not in your cart');
      const rows = await client.query('DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2', [cartId, productId.data]);
      if (!rows.rowCount) throw notFound('Item is not in your cart');
      return buildCartView(cartId, client);
    });
    res.json(view);
  }),
);

cartRouter.delete(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const view = await withTransaction(async (client) => {
      const cartId = await findCartId(req, client);
      if (cartId) {
        await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
        await client.query('UPDATE carts SET discount_code_id = NULL, extra_discount_code_id = NULL WHERE id = $1', [cartId]);
      }
      return buildCartView(cartId, client);
    });
    res.json(view);
  }),
);

cartRouter.post(
  '/discount',
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(discountSchema, req.body);
    const code = normaliseCode(body.code);
    const view = await withTransaction(async (client) => {
      const cartId = await findCartId(req, client);
      const current = cartId ? await buildCartView(cartId, client) : null;
      if (!cartId || !current || current.items.length === 0) {
        throw new ApiError(422, 'DISCOUNT_CART_EMPTY', 'Add something to your cart before using a code');
      }
      if (current.discounts.some((d) => d.code === code)) return current;
      // discount-stacking lets a second code through instead of the 409.
      const stacking = isBugOn('discount-stacking') && current.discounts.length === 1;
      if (current.discount && !stacking) {
        throw conflict('DISCOUNT_ONE_PER_ORDER', 'Only one code per order', { applied: current.discount.code });
      }
      const discount = await findDiscountByCode(code, client);
      if (!discount) throw new ApiError(422, 'DISCOUNT_UNKNOWN', "We don't recognise that code");
      const subtotal = current.items.reduce((s, i) => s + lineTotal({ unitPriceCents: i.unitPriceCents, quantity: i.quantity }), 0);
      assertDiscountUsable(discount, subtotal);
      const column = stacking ? 'extra_discount_code_id' : 'discount_code_id';
      await client.query(`UPDATE carts SET ${column} = $1, updated_at = now() WHERE id = $2`, [discount.id, cartId]);
      return buildCartView(cartId, client);
    });
    res.json(view);
  }),
);

cartRouter.delete(
  '/discount',
  asyncHandler(async (req: Request, res: Response) => {
    const cartId = await findCartId(req);
    if (cartId) {
      await withTransaction((client) =>
        client.query('UPDATE carts SET discount_code_id = NULL, extra_discount_code_id = NULL, updated_at = now() WHERE id = $1', [cartId]),
      );
    }
    res.json(await buildCartView(cartId));
  }),
);
