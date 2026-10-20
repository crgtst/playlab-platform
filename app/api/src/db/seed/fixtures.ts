import crypto from 'crypto';
import { PoolClient } from 'pg';
import { clock } from '../../lib/clock';
import { calculateTotals } from '../../lib/pricing';
import { getSeedPasswordHash, SEED_PASSWORD } from './base';

const DAY = 86_400_000;

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}@playlab.test`;
}

async function upsertProduct(client: PoolClient, sku: string, name: string, stock: number) {
  const cat = await client.query(`SELECT id FROM categories WHERE slug = 'electronics'`);
  const rows = await client.query(
    `INSERT INTO products (sku, name, description, category_id, price_cents, stock, image_url, created_at, updated_at)
     VALUES ($1, $2, 'Test fixture product.', $3, 2500, $4, '/img/electronics.svg', $5, $5)
     ON CONFLICT (sku) DO UPDATE SET stock = EXCLUDED.stock, updated_at = EXCLUDED.updated_at
     RETURNING id, sku, name, price_cents, stock`,
    [sku, name, cat.rows[0].id, stock, clock.now()],
  );
  const p = rows.rows[0];
  return { id: p.id, sku: p.sku, name: p.name, priceCents: p.price_cents, stock: p.stock };
}

interface CodeSpec {
  code: string;
  description: string;
  type: 'percent' | 'fixed';
  value: number;
  minSpendCents?: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  singleUse?: boolean;
  usedCount?: number;
}

async function upsertCode(client: PoolClient, s: CodeSpec) {
  await client.query(
    `INSERT INTO discount_codes (code, description, type, value, min_spend_cents, starts_at, expires_at, single_use, used_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, type = EXCLUDED.type, value = EXCLUDED.value,
       min_spend_cents = EXCLUDED.min_spend_cents, starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at,
       single_use = EXCLUDED.single_use, used_count = EXCLUDED.used_count`,
    [s.code, s.description, s.type, s.value, s.minSpendCents ?? 0, s.startsAt ?? null, s.expiresAt ?? null, s.singleUse ?? false, s.usedCount ?? 0],
  );
  return {
    code: s.code,
    type: s.type,
    value: s.value,
    minSpendCents: s.minSpendCents ?? 0,
    startsAt: s.startsAt?.toISOString() ?? null,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    singleUse: s.singleUse ?? false,
    usedCount: s.usedCount ?? 0,
  };
}

export async function createUser(client: PoolClient, opts: { role?: string; name?: string; email?: string } = {}) {
  const email = (opts.email ?? uniqueEmail(opts.role ?? 'customer')).toLowerCase();
  const rows = await client.query(
    `INSERT INTO users (email, name, password_hash, role, email_verified, created_at) VALUES ($1, $2, $3, $4, TRUE, $5) RETURNING *`,
    [email, opts.name ?? 'Test User', getSeedPasswordHash(), opts.role ?? 'customer', clock.now()],
  );
  return rows.rows[0];
}

async function customerWithOrders(client: PoolClient) {
  const user = await createUser(client, { name: 'Olivia Orders', email: uniqueEmail('orders') });
  const products = await client.query(`SELECT id, name, price_cents FROM products WHERE sku IN ('BK-001', 'HK-005', 'CL-005') ORDER BY sku`);
  const now = clock.nowMs();
  const history = [
    { daysAgo: 20, status: 'delivered', items: [products.rows[0]] },
    { daysAgo: 5, status: 'shipped', items: [products.rows[1], products.rows[2]] },
    { daysAgo: 1, status: 'paid', items: [products.rows[2]] },
  ];
  const orders = [];
  for (const h of history) {
    const totals = calculateTotals(h.items.map((p: any) => ({ unitPriceCents: p.price_cents, quantity: 1 })), null);
    const seq = await client.query("SELECT 'PL-' || lpad(nextval('order_number_seq')::text, 6, '0') AS number");
    const created = new Date(now - h.daysAgo * DAY);
    const o = await client.query(
      `INSERT INTO orders (number, user_id, status, subtotal_cents, discount_cents, vat_cents, delivery_cents, total_cents,
                           shipping, delivery_date, card_last4, created_at)
       VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9, '4242', $10) RETURNING id, number, status, created_at`,
      [
        seq.rows[0].number, user.id, h.status, totals.subtotalCents, totals.vatCents, totals.deliveryCents, totals.totalCents,
        JSON.stringify({ fullName: user.name, line1: '1 Grafton Street', line2: '', city: 'Dublin 2', county: 'Dublin', postcode: 'D02 XY45', country: 'IE', phone: '' }),
        new Date(created.getTime() + 3 * DAY).toISOString().slice(0, 10),
        created,
      ],
    );
    for (const p of h.items) {
      await client.query('INSERT INTO order_items (order_id, product_id, name, unit_price_cents, quantity) VALUES ($1, $2, $3, $4, 1)', [
        o.rows[0].id, p.id, p.name, p.price_cents,
      ]);
    }
    orders.push({ id: o.rows[0].id, number: o.rows[0].number, status: o.rows[0].status, createdAt: o.rows[0].created_at });
  }
  return { user: { id: user.id, email: user.email, name: user.name, password: SEED_PASSWORD }, orders: orders.reverse() };
}

export const FIXTURES: Record<string, (client: PoolClient) => Promise<unknown>> = {
  'customer-with-orders': customerWithOrders,
  'out-of-stock-product': (c) => upsertProduct(c, 'FX-OOS', 'Sold Out Synthesiser', 0),
  'low-stock-product': (c) => upsertProduct(c, 'FX-LOW', 'Last One Lamp', 1),
  'expired-discount': (c) =>
    upsertCode(c, { code: 'EXPIRED10', description: 'Expired 10% code', type: 'percent', value: 10, expiresAt: new Date(clock.nowMs() - DAY) }),
  'future-discount': (c) =>
    upsertCode(c, { code: 'FUTURE10', description: 'Not yet active 10% code', type: 'percent', value: 10, startsAt: new Date(clock.nowMs() + 7 * DAY) }),
  'single-use-discount': (c) =>
    upsertCode(c, { code: 'ONCE15', description: 'Single-use 15% code', type: 'percent', value: 15, singleUse: true }),
  'used-discount': (c) =>
    upsertCode(c, { code: 'USED10', description: 'Already used single-use code', type: 'percent', value: 10, singleUse: true, usedCount: 1 }),
  'min-spend-discount': (c) =>
    upsertCode(c, { code: 'MIN50', description: '10% off when you spend €50', type: 'percent', value: 10, minSpendCents: 5000 }),
};
