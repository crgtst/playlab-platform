import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { clock } from '../lib/clock';
import { ApiError, conflict } from '../lib/errors';
import { calculateTotals, Discount, lineTotal, Totals } from '../lib/pricing';
import { CART_COOKIE } from '../middleware/auth';

type Db = PoolClient | typeof pool;

export interface DiscountRow {
  id: number;
  code: string;
  description: string;
  type: 'percent' | 'fixed';
  value: number;
  min_spend_cents: number;
  starts_at: Date | null;
  expires_at: Date | null;
  single_use: boolean;
  used_count: number;
}

export interface CartItemView {
  productId: number;
  sku: string;
  name: string;
  imageUrl: string;
  quantity: number;
  stock: number;
  unitPriceCents: number;
  priceAtAddCents: number;
  priceChanged: boolean;
  lineTotalCents: number;
}

export interface CartNotice {
  code: string;
  message: string;
}

export interface CartView {
  id: string;
  items: CartItemView[];
  itemCount: number;
  discount: { code: string; description: string; type: 'percent' | 'fixed'; value: number; amountCents: number } | null;
  totals: Totals;
  currency: 'EUR';
  priceChanged: boolean;
  notices: CartNotice[];
}

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 };

export function formatEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

/** Finds the current cart for the request: the user's cart when logged in, else the guest cookie cart. */
export async function findCartId(req: Request, db: Db = pool): Promise<string | null> {
  if (req.user) {
    const rows = await db.query('SELECT id FROM carts WHERE user_id = $1', [req.user.id]);
    return rows.rows[0]?.id ?? null;
  }
  const cookieId = req.cookies?.[CART_COOKIE];
  if (!cookieId || !/^[0-9a-f-]{36}$/i.test(cookieId)) return null;
  const rows = await db.query('SELECT id FROM carts WHERE id = $1 AND user_id IS NULL', [cookieId]);
  return rows.rows[0]?.id ?? null;
}

export async function getOrCreateCartId(req: Request, res: Response, db: Db = pool): Promise<string> {
  const existing = await findCartId(req, db);
  if (existing) return existing;
  if (req.user) {
    const rows = await db.query(
      `INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id`,
      [req.user.id],
    );
    return rows.rows[0].id;
  }
  const rows = await db.query('INSERT INTO carts DEFAULT VALUES RETURNING id');
  res.cookie(CART_COOKIE, rows.rows[0].id, COOKIE_OPTS);
  return rows.rows[0].id;
}

/** Throws the right ApiError when a code cannot be used. `subtotalCents` is the goods subtotal. */
export function assertDiscountUsable(d: DiscountRow, subtotalCents: number): void {
  const now = clock.now();
  if (d.expires_at && d.expires_at <= now) {
    throw new ApiError(422, 'DISCOUNT_EXPIRED', 'This code has expired');
  }
  if (d.starts_at && d.starts_at > now) {
    throw new ApiError(422, 'DISCOUNT_NOT_ACTIVE', 'This code is not active yet');
  }
  if (d.single_use && d.used_count > 0) {
    throw new ApiError(422, 'DISCOUNT_ALREADY_USED', 'This code has already been used');
  }
  if (d.min_spend_cents > 0 && subtotalCents < d.min_spend_cents) {
    throw new ApiError(422, 'DISCOUNT_MIN_SPEND', `Spend at least ${formatEuro(d.min_spend_cents)} to use this code`, {
      minSpendCents: d.min_spend_cents,
    });
  }
}

export function normaliseCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export async function findDiscountByCode(code: string, db: Db = pool): Promise<DiscountRow | null> {
  const rows = await db.query('SELECT * FROM discount_codes WHERE code = $1', [normaliseCode(code)]);
  return rows.rows[0] ?? null;
}

/**
 * Builds the cart view. Re-validates the applied discount every time: if it is no longer usable
 * (e.g. the cart dropped below the minimum spend) it is removed and a notice explains why.
 */
export async function buildCartView(cartId: string | null, db: Db = pool): Promise<CartView> {
  const empty: CartView = {
    id: cartId ?? '',
    items: [],
    itemCount: 0,
    discount: null,
    totals: calculateTotals([], null),
    currency: 'EUR',
    priceChanged: false,
    notices: [],
  };
  if (!cartId) return empty;

  const itemRows = await db.query(
    `SELECT ci.product_id, ci.quantity, ci.unit_price_cents_at_add, p.sku, p.name, p.image_url, p.price_cents, p.stock
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = $1
      ORDER BY ci.added_at, ci.product_id`,
    [cartId],
  );
  const items: CartItemView[] = itemRows.rows.map((r: any) => ({
    productId: r.product_id,
    sku: r.sku,
    name: r.name,
    imageUrl: r.image_url,
    quantity: r.quantity,
    stock: r.stock,
    unitPriceCents: r.price_cents,
    priceAtAddCents: r.unit_price_cents_at_add,
    priceChanged: r.price_cents !== r.unit_price_cents_at_add,
    lineTotalCents: lineTotal({ unitPriceCents: r.price_cents, quantity: r.quantity }),
  }));

  const notices: CartNotice[] = [];
  const cartRow = await db.query(
    `SELECT dc.* FROM carts c LEFT JOIN discount_codes dc ON dc.id = c.discount_code_id WHERE c.id = $1`,
    [cartId],
  );
  let discountRow: DiscountRow | null = cartRow.rows[0]?.id ? cartRow.rows[0] : null;

  const lines = items.map((i) => ({ unitPriceCents: i.unitPriceCents, quantity: i.quantity }));
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  if (discountRow) {
    try {
      if (items.length === 0) throw new ApiError(422, 'DISCOUNT_CART_EMPTY', 'Your cart is empty');
      assertDiscountUsable(discountRow, subtotal);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      await db.query('UPDATE carts SET discount_code_id = NULL, updated_at = now() WHERE id = $1', [cartId]);
      notices.push({
        code: 'DISCOUNT_REMOVED',
        message: `Code ${discountRow.code} was removed: ${err.message.charAt(0).toLowerCase()}${err.message.slice(1)}`,
      });
      discountRow = null;
    }
  }

  const discount: Discount | null = discountRow ? { type: discountRow.type, value: discountRow.value } : null;
  const totals = calculateTotals(lines, discount);

  return {
    id: cartId,
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    discount: discountRow
      ? {
          code: discountRow.code,
          description: discountRow.description,
          type: discountRow.type,
          value: discountRow.value,
          amountCents: totals.discountCents,
        }
      : null,
    totals,
    currency: 'EUR',
    priceChanged: items.some((i) => i.priceChanged),
    notices,
  };
}

export function stockError(stock: number): ApiError {
  return conflict(
    'INSUFFICIENT_STOCK',
    stock === 0 ? 'This item is out of stock' : `Only ${stock} left`,
    { available: stock },
  );
}

/**
 * Merges the guest cart (cookie) into the user's cart after login. Where both carts hold the same
 * product the larger quantity wins, so logging in twice never doubles quantities.
 */
export async function mergeGuestCart(guestCartId: string | undefined, userId: number, client: PoolClient): Promise<void> {
  if (!guestCartId || !/^[0-9a-f-]{36}$/i.test(guestCartId)) return;
  const guest = await client.query('SELECT id, discount_code_id FROM carts WHERE id = $1 AND user_id IS NULL', [guestCartId]);
  if (!guest.rows[0]) return;

  const userCart = await client.query(
    `INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING id, discount_code_id`,
    [userId],
  );
  const userCartId = userCart.rows[0].id;

  await client.query(
    `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price_cents_at_add, added_at)
     SELECT $1, gi.product_id, LEAST(gi.quantity, p.stock), gi.unit_price_cents_at_add, gi.added_at
       FROM cart_items gi JOIN products p ON p.id = gi.product_id
      WHERE gi.cart_id = $2 AND p.stock > 0
     ON CONFLICT (cart_id, product_id)
     DO UPDATE SET quantity = GREATEST(cart_items.quantity, EXCLUDED.quantity)`,
    [userCartId, guestCartId],
  );

  if (!userCart.rows[0].discount_code_id && guest.rows[0].discount_code_id) {
    await client.query('UPDATE carts SET discount_code_id = $1 WHERE id = $2', [guest.rows[0].discount_code_id, userCartId]);
  }
  await client.query('DELETE FROM carts WHERE id = $1', [guestCartId]);
}
