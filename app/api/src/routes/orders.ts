import { Request, Response, Router } from 'express';
import { PoolClient } from 'pg';
import { typeErrors, z } from '../lib/zod';
import { pool, query, withTransaction } from '../db/pool';
import { clock } from '../lib/clock';
import { ApiError, conflict, notFound } from '../lib/errors';
import { ordersCreated } from '../lib/metrics';
import { checkIfMatch } from '../lib/preconditions';
import { cardSchema } from '../lib/cardSchema';
import { chargeCard } from '../lib/payments';
import { lineTotal } from '../lib/pricing';
import { requireAuth, requireRole } from '../middleware/auth';
import { noStore } from '../middleware/noStore';
import { asyncHandler, parse } from '../middleware/validate';
import { buildCartView, CartView, stockError } from '../services/cart';
import { euros, toCsv } from '../lib/csv';
import { events } from '../lib/events';
import { isBugOn } from '../lib/bugs';
import { emitStock } from '../services/stock';

export const ordersRouter = Router();
ordersRouter.use(noStore, requireAuth);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const shippingSchema = z.object({
  fullName: z
    .string(typeErrors({ required: 'Full name is required' }))
    .trim()
    .min(1, 'Full name is required')
    .max(500),
  line1: z
    .string(typeErrors({ required: 'Address line 1 is required' }))
    .trim()
    .min(1, 'Address line 1 is required')
    .max(200),
  line2: z.string().trim().max(200).optional().default(''),
  city: z
    .string(typeErrors({ required: 'Town or city is required' }))
    .trim()
    .min(1, 'Town or city is required')
    .max(100),
  county: z.string().trim().max(100).optional().default(''),
  postcode: z
    .string(typeErrors({ required: 'Eircode or postcode is required' }))
    .trim()
    .min(1, 'Eircode or postcode is required')
    .max(20),
  country: z.string().trim().length(2, 'Use a 2-letter country code').default('IE'),
  phone: z.string().trim().max(30).optional().default(''),
});

const orderSchema = z
  .object({
    shipping: shippingSchema,
    deliveryDate: z.string(typeErrors({ required: 'Choose a delivery date' })).regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD'),
    instructions: z.string().max(200, 'Instructions must be at most 200 characters').optional().default(''),
    // Pay either with card details directly (API clients) or with an intent confirmed in the payment iframe (the web app).
    payment: cardSchema.optional(),
    paymentIntentId: z.string().guid('paymentIntentId must be a UUID').optional(),
    acceptPriceChanges: z.boolean().optional().default(false),
    // Item prices sent by the client are ignored (prices always come from the database), except by the price-tamper defect.
    items: z
      .array(
        z.object({ productId: z.number().int(), unitPriceCents: z.number().int().optional(), priceCents: z.number().int().optional() }),
      )
      .optional(),
  })
  .refine((v) => (v.payment === undefined) !== (v.paymentIntentId === undefined), {
    message: 'Send either payment (card details) or paymentIntentId, not both',
    path: ['payment'],
  });

export const ORDER_STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
const statusSchema = z.enum(ORDER_STATUSES, {
  error: `Status must be one of: ${ORDER_STATUSES.join(', ')}`,
});
type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed status changes (PLS-20). Setting an order to the status it already has is a no-op, not a change. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
/** Customers may cancel their own order only before it is being packed. */
const CUSTOMER_CANCELLABLE: OrderStatus[] = ['pending', 'paid'];

interface StatusRow {
  id: number;
  number: string;
  user_id: number;
  status: OrderStatus;
}

function canMove(from: OrderStatus, to: OrderStatus): boolean {
  // status-any-transition: the transition rules are not checked.
  return from === to || TRANSITIONS[from].includes(to) || isBugOn('status-any-transition');
}

function invalidTransition(o: StatusRow, to: OrderStatus, allowed = TRANSITIONS[o.status]) {
  return new ApiError(409, 'INVALID_TRANSITION', `Order ${o.number} is ${o.status}, so it can't be changed to ${to}`, {
    from: o.status,
    to,
    allowed,
  });
}

/**
 * Moves orders to a status inside the caller's transaction. Cancelling puts each item's quantity back in stock
 * (PLS-20.5); the returned product ids need emitStock once the transaction commits.
 */
async function applyStatus(client: PoolClient, orders: StatusRow[], to: OrderStatus): Promise<number[]> {
  const moving = orders.filter((o) => o.status !== to).map((o) => o.id);
  if (!moving.length) return [];
  await client.query('UPDATE orders SET status = $1, version = version + 1 WHERE id = ANY($2)', [to, moving]);
  if (to !== 'cancelled') return [];
  const restocked = await client.query(
    `UPDATE products p SET stock = p.stock + s.qty
       FROM (SELECT product_id, SUM(quantity)::int AS qty FROM order_items WHERE order_id = ANY($1) GROUP BY product_id) s
      WHERE p.id = s.product_id
      RETURNING p.id`,
    [moving],
  );
  return restocked.rows.map((r: { id: number }) => r.id);
}

const ORDER_SORTS = {
  newest: 'o.created_at DESC, o.id DESC',
  oldest: 'o.created_at ASC, o.id ASC',
  total_desc: 'o.total_cents DESC, o.id DESC',
  total_asc: 'o.total_cents ASC, o.id ASC',
} as const;

const filterSchema = z.object({
  status: statusSchema.optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(Object.keys(ORDER_SORTS) as [keyof typeof ORDER_SORTS, ...(keyof typeof ORDER_SORTS)[]]).default('newest'),
});

const listSchema = filterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'Select at least one order').max(200),
  status: statusSchema,
});

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
    if (item.quantity > item.stock && !isBugOn('stock-oversell')) {
      const err = stockError(item.stock);
      err.message = `${item.name}: ${err.message}`;
      err.details = { productId: item.productId, available: item.stock };
      throw err;
    }
  }
}

export async function loadOrder(id: number, db: PoolClient | typeof pool = pool) {
  const orders = await db.query(
    'SELECT o.*, u.email AS customer_email, u.name AS customer_name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1',
    [id],
  );
  const o = orders.rows[0];
  if (!o) return null;
  const items = await db.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY name', [id]);
  return orderView(o, items.rows);
}

/** Changes with every status change, so it works for If-Match (PLS-21.5, 21.6). */
export function orderEtag(o: { id: number; version: number }): string {
  return `"order-${o.id}-v${o.version}"`;
}

function orderView(o: any, items: any[]) {
  return {
    id: o.id,
    number: o.number,
    etag: orderEtag(o),
    userId: o.user_id,
    customer: { id: o.user_id, email: o.customer_email, name: o.customer_name },
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

/** A payment intent can pay for an order once, only for its owner, and only for the amount it was created for. */
async function checkIntent(id: string, userId: number, totalCents: number, db: PoolClient | typeof pool = pool) {
  const lock = db !== pool && !isBugOn('double-submit');
  const rows = await db.query(`SELECT * FROM payment_intents WHERE id = $1 AND user_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, userId]);
  const intent = rows.rows[0];
  if (!intent) throw new ApiError(422, 'PAYMENT_NOT_FOUND', 'Payment not found');
  if (intent.status === 'declined') throw new ApiError(402, 'PAYMENT_DECLINED', 'Your card was declined');
  if (intent.status !== 'succeeded') throw new ApiError(409, 'PAYMENT_NOT_COMPLETED', 'This payment has not been completed');
  if (intent.used_at && !isBugOn('double-submit'))
    throw new ApiError(409, 'PAYMENT_ALREADY_USED', 'This payment has already been used for an order');
  if (intent.amount_cents !== totalCents) {
    throw new ApiError(409, 'PAYMENT_AMOUNT_MISMATCH', 'Your order total changed after payment. Please pay again.', {
      paidCents: intent.amount_cents,
      totalCents,
    });
  }
  return intent;
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

    // Pre-flight checks without locks, so a slow payment never holds row locks.
    const cartRow = await query<{ id: string }>('SELECT id FROM carts WHERE user_id = $1', [user.id]);
    // price-tamper: trust prices sent by the client.
    const priceOverrides =
      isBugOn('price-tamper') && body.items
        ? new Map(
            body.items.map((i) => [i.productId, i.unitPriceCents ?? i.priceCents ?? NaN]).filter(([, v]) => Number.isInteger(v)) as [
              number,
              number,
            ][],
          )
        : undefined;
    const preCart = await buildCartView(cartRow[0]?.id ?? null, pool, { priceOverrides });
    assertCartReady(preCart, body.acceptPriceChanges);

    let cardLast4: string;
    if (body.payment) {
      await chargeCard(body.payment.cardNumber);
      cardLast4 = body.payment.cardNumber.slice(-4);
    } else {
      cardLast4 = (await checkIntent(body.paymentIntentId!, user.id, preCart.totals.totalCents)).card_last4;
    }

    // double-submit: no locking, and a slow "processing" step, so two concurrent submits both succeed.
    const doubleSubmit = isBugOn('double-submit');
    if (doubleSubmit) await new Promise((r) => setTimeout(r, 300));

    let order;
    try {
      order = await withTransaction(async (client) => {
        let cartId: string | null;
        let cart: CartView;
        if (doubleSubmit) {
          cartId = cartRow[0]?.id ?? null;
          cart = preCart;
        } else {
          // Locking the cart row serialises double submits: the second request waits, then finds an empty cart.
          const locked = await client.query('SELECT id FROM carts WHERE user_id = $1 FOR UPDATE', [user.id]);
          cartId = locked.rows[0]?.id ?? null;
          if (cartId) {
            await client.query(
              'SELECT p.id FROM products p JOIN cart_items ci ON ci.product_id = p.id WHERE ci.cart_id = $1 ORDER BY p.id FOR UPDATE OF p',
              [cartId],
            );
          }
          cart = await buildCartView(cartId, client, { priceOverrides });
          assertCartReady(cart, body.acceptPriceChanges);
        }
        for (const applied of cart.discounts) {
          const d = await client.query('SELECT * FROM discount_codes WHERE code = $1 FOR UPDATE', [applied.code]);
          if (d.rows[0]?.single_use && d.rows[0].used_count > 0 && !isBugOn('single-use-reused')) {
            throw new ApiError(422, 'DISCOUNT_ALREADY_USED', 'This code has already been used');
          }
          await client.query('UPDATE discount_codes SET used_count = used_count + 1 WHERE id = $1', [d.rows[0].id]);
        }

        if (body.paymentIntentId) {
          const intent = await checkIntent(body.paymentIntentId, user.id, cart.totals.totalCents, client);
          await client.query('UPDATE payment_intents SET used_at = $1 WHERE id = $2', [clock.now(), intent.id]);
        }

        const seq = await client.query("SELECT 'PL-' || lpad(nextval('order_number_seq')::text, 6, '0') AS number");
        const inserted = await client.query(
          `INSERT INTO orders (number, user_id, status, subtotal_cents, discount_cents, vat_cents, delivery_cents, total_cents,
                               discount_code, shipping, delivery_date, instructions, card_last4, idempotency_key, created_at,
                               payment_intent_id)
           VALUES ($1, $2, 'paid', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
          [
            seq.rows[0].number,
            user.id,
            cart.totals.subtotalCents,
            cart.totals.discountCents,
            cart.totals.vatCents,
            cart.totals.deliveryCents,
            cart.totals.totalCents,
            cart.discounts.length ? cart.discounts.map((d) => d.code).join('+') : null,
            JSON.stringify(body.shipping),
            body.deliveryDate,
            body.instructions,
            cardLast4,
            idemKey ?? null,
            clock.now(),
            doubleSubmit ? null : (body.paymentIntentId ?? null),
          ],
        );
        const orderId = inserted.rows[0].id;
        for (const item of cart.items) {
          await client.query(
            'INSERT INTO order_items (order_id, product_id, name, unit_price_cents, quantity) VALUES ($1, $2, $3, $4, $5)',
            [orderId, item.productId, item.name, item.unitPriceCents, item.quantity],
          );
          // Clamped at 0: only reachable below 0 with the stock-oversell defect.
          await client.query('UPDATE products SET stock = GREATEST(stock - $1, 0) WHERE id = $2', [item.quantity, item.productId]);
        }
        await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
        await client.query('UPDATE carts SET discount_code_id = NULL, extra_discount_code_id = NULL, updated_at = now() WHERE id = $1', [
          cartId,
        ]);
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
    ordersCreated.inc();
    await emitStock(order!.items.map((i) => i.productId));
    res.status(201).location(`/api/v1/orders/${order!.id}`).json({ data: order });
  }),
);

function canSeeAll(role: string) {
  return role === 'admin' || role === 'support';
}

/** Builds the WHERE clause shared by the order list and the CSV export. */
function orderFilters(user: { id: number; role: string }, f: z.infer<typeof filterSchema>) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!canSeeAll(user.role)) {
    params.push(user.id);
    where.push(`o.user_id = $${params.length}`);
  }
  if (f.status) {
    params.push(f.status);
    where.push(`o.status = $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    where.push(`(o.number ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params, order: ORDER_SORTS[f.sort] };
}

ordersRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const q = parse(listSchema, req.query);
    const f = orderFilters(req.user!, q);
    const count = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM orders o JOIN users u ON u.id = o.user_id ${f.sql}`, f.params);
    const rows = await query<{ id: number }>(
      `SELECT o.id FROM orders o JOIN users u ON u.id = o.user_id ${f.sql} ORDER BY ${f.order}
        LIMIT $${f.params.length + 1} OFFSET $${f.params.length + 2}`,
      [...f.params, q.limit, (q.page - 1) * q.limit],
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
  '/export.csv',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const f = orderFilters(req.user!, parse(filterSchema, req.query));
    const rows = await query(
      `SELECT o.*, u.email AS customer_email,
              (SELECT string_agg(oi.quantity || ' x ' || oi.name, '; ' ORDER BY oi.name) FROM order_items oi WHERE oi.order_id = o.id) AS items
         FROM orders o JOIN users u ON u.id = o.user_id ${f.sql} ORDER BY ${f.order}`,
      f.params,
    );
    const csv = toCsv(
      [
        'number',
        'created_at',
        'customer_email',
        'status',
        'items',
        'subtotal',
        'discount_code',
        'discount',
        'vat',
        'delivery',
        'total',
        'currency',
      ],
      rows.map((o: any) => [
        o.number,
        new Date(o.created_at).toISOString(),
        o.customer_email,
        o.status,
        o.items ?? '',
        euros(o.subtotal_cents),
        o.discount_code ?? '',
        euros(o.discount_cents),
        euros(o.vat_cents),
        euros(o.delivery_cents),
        euros(o.total_cents),
        'EUR',
      ]),
    );
    const stamp = clock.now().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${stamp}.csv"`);
    res.send(csv);
  }),
);

ordersRouter.post(
  '/bulk-status',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(bulkSchema, req.body);
    const ids = [...new Set(body.ids)];
    const changed = await withTransaction(async (client) => {
      const rows = await client.query('SELECT id, number, user_id, status FROM orders WHERE id = ANY($1) FOR UPDATE', [ids]);
      if (rows.rowCount !== ids.length) {
        const found = new Set(rows.rows.map((r: any) => r.id));
        throw new ApiError(
          422,
          'VALIDATION_ERROR',
          'Some orders do not exist',
          ids.filter((i) => !found.has(i)).map((i) => ({ field: 'ids', message: `Order ${i} not found` })),
        );
      }
      // All or nothing: one order that can't make the change stops the whole batch (PLS-20.4).
      const refused = (rows.rows as StatusRow[]).filter((o) => !canMove(o.status, body.status));
      if (refused.length) {
        throw new ApiError(
          409,
          'INVALID_TRANSITION',
          `${refused.length} of the selected orders can't be changed to ${body.status}; none were changed`,
          { to: body.status, orders: refused.map((o) => ({ id: o.id, number: o.number, from: o.status, allowed: TRANSITIONS[o.status] })) },
        );
      }
      const restocked = await applyStatus(client, rows.rows, body.status);
      return { orders: rows.rows as StatusRow[], restocked };
    });
    await emitStock(changed.restocked);
    for (const o of changed.orders) emitStatusChange(o, body.status, req.user!.id);
    const data = [];
    for (const id of ids) data.push(await loadOrder(id));
    res.json({ data, meta: { updated: data.length } });
  }),
);

function emitStatusChange(o: { id: number; number: string; user_id: number; status: string }, to: string, changedBy: number) {
  if (o.status === to) return;
  events.emitEvent('orderStatusChanged', {
    orderId: o.id,
    number: o.number,
    userId: o.user_id,
    from: o.status,
    to,
    changedBy,
    at: clock.now().toISOString(),
  });
}

function orderIdParam(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw notFound('Order not found');
  return id;
}

/** Loads an order the current user may see. Other customers' orders are a 404, so ids are not revealed. */
async function visibleOrder(req: Request<{ id: string }>) {
  const order = await loadOrder(orderIdParam(req.params.id));
  const user = req.user!;
  const leak = isBugOn('order-leak');
  if (!order || (!canSeeAll(user.role) && order.userId !== user.id && !leak)) throw notFound('Order not found');
  return order;
}

ordersRouter.get(
  '/:id',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const order = await visibleOrder(req);
    res.setHeader('ETag', order.etag);
    res.json({ data: order });
  }),
);

ordersRouter.patch(
  '/:id/status',
  requireRole('admin'),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const id = orderIdParam(req.params.id);
    const { status } = parse(z.object({ status: statusSchema }), req.body);
    const before = await withTransaction(async (client) => {
      const rows = await client.query('SELECT id, number, user_id, status, version FROM orders WHERE id = $1 FOR UPDATE', [id]);
      const order = rows.rows[0] as (StatusRow & { version: number }) | undefined;
      if (!order) throw notFound('Order not found');
      checkIfMatch(req, orderEtag(order), 'order');
      if (!canMove(order.status, status)) throw invalidTransition(order, status);
      return { order, restocked: await applyStatus(client, [order], status) };
    });
    await emitStock(before.restocked);
    emitStatusChange(before.order, status, req.user!.id);
    const updated = (await loadOrder(id))!;
    res.setHeader('ETag', updated.etag);
    res.json({ data: updated });
  }),
);

/** A customer cancels their own order while it is pending or paid (PLS-20.6); its items go back in stock. */
ordersRouter.post(
  '/:id/cancel',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const id = orderIdParam(req.params.id);
    const user = req.user!;
    const result = await withTransaction(async (client) => {
      const rows = await client.query('SELECT id, number, user_id, status FROM orders WHERE id = $1 FOR UPDATE', [id]);
      const order = rows.rows[0] as StatusRow | undefined;
      // Another customer's order is a 404, as for reads (PLS-24.1), unless order-leak is on.
      if (!order || (order.user_id !== user.id && !isBugOn('order-leak'))) throw notFound('Order not found');
      // A customer has no other moves, so nothing is allowed once the order is being packed.
      if (!CUSTOMER_CANCELLABLE.includes(order.status)) throw invalidTransition(order, 'cancelled', []);
      return { order, restocked: await applyStatus(client, [order], 'cancelled') };
    });
    await emitStock(result.restocked);
    emitStatusChange(result.order, 'cancelled', user.id);
    res.json({ data: await loadOrder(id) });
  }),
);

const CARRIER = 'PlayLab Post';
const STEP_ORDER = ['paid', 'processing', 'shipped', 'delivered'];

ordersRouter.get(
  '/:id/tracking',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const order = await visibleOrder(req);
    const placed = new Date(order.createdAt).getTime();
    const hour = 3_600_000;
    const reached = STEP_ORDER.indexOf(order.status);
    const steps = [
      { status: 'placed', label: 'Order placed', at: new Date(placed) },
      { status: 'paid', label: 'Payment confirmed', at: new Date(placed + 60_000) },
      { status: 'processing', label: 'Being packed', at: new Date(placed + 20 * hour) },
      { status: 'shipped', label: `Handed to ${CARRIER}`, at: new Date(placed + 44 * hour) },
      {
        status: 'delivered',
        label: 'Delivered',
        at: order.deliveryDate ? new Date(`${order.deliveryDate}T14:00:00Z`) : new Date(placed + 72 * hour),
      },
    ];
    const timeline =
      order.status === 'cancelled'
        ? [steps[0], { status: 'cancelled', label: 'Order cancelled', at: new Date(placed + 2 * hour) }]
        : steps.filter((s, i) => i === 0 || (reached >= 0 && i - 1 <= reached));
    res.json({
      data: {
        orderId: order.id,
        number: order.number,
        status: order.status,
        carrier: CARRIER,
        trackingNumber: `PLP${order.number.replace(/\D/g, '')}IE`,
        estimatedDelivery: order.deliveryDate,
        events: timeline.map((t) => ({ status: t.status, label: t.label, at: t.at.toISOString() })),
      },
    });
  }),
);
