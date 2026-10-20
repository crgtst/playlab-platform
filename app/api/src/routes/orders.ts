import { Request, Response, Router } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, query, withTransaction } from '../db/pool';
import { clock } from '../lib/clock';
import { ApiError, conflict, notFound } from '../lib/errors';
import { chargeCard, luhnValid } from '../lib/payments';
import { lineTotal } from '../lib/pricing';
import { requireAuth } from '../middleware/auth';
import { noStore } from '../middleware/noStore';
import { asyncHandler, parse } from '../middleware/validate';
import { buildCartView, CartView, stockError } from '../services/cart';

export const ordersRouter = Router();
ordersRouter.use(noStore, requireAuth);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const shippingSchema = z.object({
  fullName: z.string({ required_error: 'Full name is required' }).trim().min(1, 'Full name is required').max(500),
  line1: z.string({ required_error: 'Address line 1 is required' }).trim().min(1, 'Address line 1 is required').max(200),
  line2: z.string().trim().max(200).optional().default(''),
  city: z.string({ required_error: 'Town or city is required' }).trim().min(1, 'Town or city is required').max(100),
  county: z.string().trim().max(100).optional().default(''),
  postcode: z.string({ required_error: 'Eircode or postcode is required' }).trim().min(1, 'Eircode or postcode is required').max(20),
  country: z.string().trim().length(2, 'Use a 2-letter country code').default('IE'),
  phone: z.string().trim().max(30).optional().default(''),
});

const paymentSchema = z.object({
  cardNumber: z
    .string({ required_error: 'Card number is required' })
    .transform((s) => s.replace(/[\s-]/g, ''))
    .refine((s) => /^\d{12,19}$/.test(s) && luhnValid(s), 'Enter a valid card number'),
  expiry: z
    .string({ required_error: 'Expiry date is required' })
    .trim()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use the format MM/YY'),
  cvc: z.string({ required_error: 'Security code is required' }).trim().regex(/^\d{3,4}$/, 'Enter 3 or 4 digits'),
  nameOnCard: z.string({ required_error: 'Name on card is required' }).trim().min(1, 'Name on card is required').max(200),
});

const orderSchema = z.object({
  shipping: shippingSchema,
  deliveryDate: z.string({ required_error: 'Choose a delivery date' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD'),
  instructions: z.string().max(200, 'Instructions must be at most 200 characters').optional().default(''),
  payment: paymentSchema,
  acceptPriceChanges: z.boolean().optional().default(false),
  // Anything else the client sends (e.g. item prices) is ignored: prices always come from the database.
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function cardExpired(expiry: string): boolean {
  const [mm, yy] = expiry.split('/').map(Number);
  const now = clock.now();
  const endOfMonth = Date.UTC(2000 + yy, mm, 1); // first day of the following month
  return endOfMonth <= now.getTime();
}

function validateDeliveryDate(value: string) {
  const today = clock.now();
  const min = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
  const max = new Date(min.getTime() + 29 * 86_400_000);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || isoDate(d) !== value) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'deliveryDate', message: 'Enter a real date' }]);
  }
  if (d < min || d > max) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'deliveryDate', message: `Choose a date between ${isoDate(min)} and ${isoDate(max)}` },
    ]);
  }
}

function assertCartReady(cart: CartView, acceptPriceChanges: boolean) {
  if (cart.items.length === 0) throw new ApiError(422, 'CART_EMPTY', 'Your cart is empty');
  if (cart.priceChanged && !acceptPriceChanges) {
    throw conflict(
      'PRICE_CHANGED',
      'Some prices have changed since you added them to your cart. Please review the new prices.',
      cart.items
        .filter((i) => i.priceChanged)
        .map((i) => ({ productId: i.productId, name: i.name, oldPriceCents: i.priceAtAddCents, newPriceCents: i.unitPriceCents })),
    );
  }
  for (const item of cart.items) {
    if (item.quantity > item.stock) {
      const err = stockError(item.stock);
      err.message = `${item.name}: ${err.message}`;
      err.details = { productId: item.productId, available: item.stock };
      throw err;
    }
  }
}

export async function loadOrder(id: number, db: PoolClient | typeof pool = pool) {
  const orders = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
  const o = orders.rows[0];
  if (!o) return null;
  const items = await db.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY name', [id]);
  return orderView(o, items.rows);
}

function orderView(o: any, items: any[]) {
  return {
    id: o.id,
    number: o.number,
    userId: o.user_id,
    status: o.status,
    createdAt: o.created_at,
    items: items.map((i) => ({
      productId: i.product_id,
      name: i.name,
      unitPriceCents: i.unit_price_cents,
      quantity: i.quantity,
      lineTotalCents: lineTotal({ unitPriceCents: i.unit_price_cents, quantity: i.quantity }),
    })),
    totals: {
      subtotalCents: o.subtotal_cents,
      discountCents: o.discount_cents,
      vatCents: o.vat_cents,
      deliveryCents: o.delivery_cents,
      totalCents: o.total_cents,
    },
    discount: o.discount_code ? { code: o.discount_code, amountCents: o.discount_cents } : null,
    currency: 'EUR',
    shipping: o.shipping,
    deliveryDate: o.delivery_date ? isoDate(new Date(o.delivery_date)) : null,
    instructions: o.instructions,
    cardLast4: o.card_last4,
  };
}

async function findByIdempotencyKey(userId: number, key: string) {
  const rows = await query<{ id: number }>('SELECT id FROM orders WHERE user_id = $1 AND idempotency_key = $2', [userId, key]);
  return rows[0] ? loadOrder(rows[0].id) : null;
}

ordersRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;
    const rawKey = req.header('Idempotency-Key');
    if (rawKey !== undefined && (rawKey.trim() === '' || rawKey.length > 255)) {
      throw new ApiError(400, 'BAD_REQUEST', 'Idempotency-Key must be 1-255 characters');
    }
    const idemKey = rawKey?.trim();

    if (idemKey) {
      const existing = await findByIdempotencyKey(user.id, idemKey);
      if (existing) {
        res.setHeader('Idempotent-Replayed', 'true');
        return res.status(200).json({ data: existing });
      }
    }

    const body = parse(orderSchema, req.body);
    validateDeliveryDate(body.deliveryDate);
    if (cardExpired(body.payment.expiry)) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'payment.expiry', message: 'This card has expired' }]);
    }

    // Pre-flight checks without locks, so a slow payment never holds row locks.
    const cartRow = await query<{ id: string }>('SELECT id FROM carts WHERE user_id = $1', [user.id]);
    const preCart = await buildCartView(cartRow[0]?.id ?? null);
    assertCartReady(preCart, body.acceptPriceChanges);

    await chargeCard(body.payment.cardNumber);

    let order;
    try {
      order = await withTransaction(async (client) => {
        // Locking the cart row serialises double submits: the second request waits, then finds an empty cart.
        const locked = await client.query('SELECT id FROM carts WHERE user_id = $1 FOR UPDATE', [user.id]);
        const cartId = locked.rows[0]?.id ?? null;
        if (cartId) {
          await client.query(
            'SELECT p.id FROM products p JOIN cart_items ci ON ci.product_id = p.id WHERE ci.cart_id = $1 ORDER BY p.id FOR UPDATE OF p',
            [cartId],
          );
        }
        const cart = await buildCartView(cartId, client);
        assertCartReady(cart, body.acceptPriceChanges);
        if (cart.discount) {
          const d = await client.query('SELECT * FROM discount_codes WHERE code = $1 FOR UPDATE', [cart.discount.code]);
          if (d.rows[0]?.single_use && d.rows[0].used_count > 0) {
            throw new ApiError(422, 'DISCOUNT_ALREADY_USED', 'This code has already been used');
          }
          await client.query('UPDATE discount_codes SET used_count = used_count + 1 WHERE id = $1', [d.rows[0].id]);
        }

        const seq = await client.query("SELECT 'PL-' || lpad(nextval('order_number_seq')::text, 6, '0') AS number");
        const inserted = await client.query(
          `INSERT INTO orders (number, user_id, status, subtotal_cents, discount_cents, vat_cents, delivery_cents, total_cents,
                               discount_code, shipping, delivery_date, instructions, card_last4, idempotency_key, created_at)
           VALUES ($1, $2, 'paid', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
          [
            seq.rows[0].number,
            user.id,
            cart.totals.subtotalCents,
            cart.totals.discountCents,
            cart.totals.vatCents,
            cart.totals.deliveryCents,
            cart.totals.totalCents,
            cart.discount?.code ?? null,
            JSON.stringify(body.shipping),
            body.deliveryDate,
            body.instructions,
            body.payment.cardNumber.slice(-4),
            idemKey ?? null,
            clock.now(),
          ],
        );
        const orderId = inserted.rows[0].id;
        for (const item of cart.items) {
          await client.query(
            'INSERT INTO order_items (order_id, product_id, name, unit_price_cents, quantity) VALUES ($1, $2, $3, $4, $5)',
            [orderId, item.productId, item.name, item.unitPriceCents, item.quantity],
          );
          await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, item.productId]);
        }
        await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
        await client.query('UPDATE carts SET discount_code_id = NULL, updated_at = now() WHERE id = $1', [cartId]);
        return loadOrder(orderId, client);
      });
    } catch (err: any) {
      // Two concurrent requests with the same Idempotency-Key: the loser returns the winner's order.
      if (idemKey && err?.code === '23505') {
        const existing = await findByIdempotencyKey(user.id, idemKey);
        if (existing) {
          res.setHeader('Idempotent-Replayed', 'true');
          return res.status(200).json({ data: existing });
        }
      }
      throw err;
    }
    res.status(201).location(`/api/v1/orders/${order!.id}`).json({ data: order });
  }),
);

ordersRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const q = parse(listSchema, req.query);
    const user = req.user!;
    const seeAll = user.role === 'admin' || user.role === 'support';
    const where = seeAll ? '' : 'WHERE user_id = $1';
    const params: unknown[] = seeAll ? [] : [user.id];
    const count = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM orders ${where}`, params);
    const rows = await query<{ id: number }>(
      `SELECT id FROM orders ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.limit, (q.page - 1) * q.limit],
    );
    const data = [];
    for (const r of rows) data.push(await loadOrder(r.id));
    res.json({
      data,
      meta: { page: q.page, limit: q.limit, total: count[0].n, totalPages: Math.ceil(count[0].n / q.limit) },
    });
  }),
);

ordersRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('Order not found');
    const order = await loadOrder(id);
    const user = req.user!;
    const seeAll = user.role === 'admin' || user.role === 'support';
    // 404 rather than 403 so other customers' order ids are not revealed.
    if (!order || (!seeAll && order.userId !== user.id)) throw notFound('Order not found');
    res.json({ data: order });
  }),
);
