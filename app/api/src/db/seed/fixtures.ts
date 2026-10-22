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
    [
      s.code,
      s.description,
      s.type,
      s.value,
      s.minSpendCents ?? 0,
      s.startsAt ?? null,
      s.expiresAt ?? null,
      s.singleUse ?? false,
      s.usedCount ?? 0,
    ],
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

interface FixtureOrder {
  daysAgo: number;
  status: string;
  skus: string[];
  discountCode?: string;
}

const FIXTURE_ADDRESS = {
  fullName: '',
  line1: '1 Grafton Street',
  line2: '',
  city: 'Dublin 2',
  county: 'Dublin',
  postcode: 'D02 XY45',
  country: 'IE',
  phone: '',
};

/** Inserts a historical order directly (no cart, no payment), priced with the shared pricing rules. */
async function insertOrder(client: PoolClient, user: { id: number; name: string }, spec: FixtureOrder) {
  const products = await client.query('SELECT id, name, price_cents FROM products WHERE sku = ANY($1) ORDER BY sku', [spec.skus]);
  let discount = null;
  if (spec.discountCode) {
    const d = await client.query('SELECT type, value FROM discount_codes WHERE code = $1', [spec.discountCode]);
    discount = d.rows[0] ? { type: d.rows[0].type, value: d.rows[0].value } : null;
  }
  const totals = calculateTotals(
    products.rows.map((p: any) => ({ unitPriceCents: p.price_cents, quantity: 1 })),
    discount,
  );
  const seq = await client.query("SELECT 'PL-' || lpad(nextval('order_number_seq')::text, 6, '0') AS number");
  const created = new Date(clock.nowMs() - spec.daysAgo * DAY);
  const o = await client.query(
    `INSERT INTO orders (number, user_id, status, subtotal_cents, discount_cents, vat_cents, delivery_cents, total_cents,
                         discount_code, shipping, delivery_date, card_last4, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '4242', $12) RETURNING id, number, status, created_at`,
    [
      seq.rows[0].number,
      user.id,
      spec.status,
      totals.subtotalCents,
      totals.discountCents,
      totals.vatCents,
      totals.deliveryCents,
      totals.totalCents,
      discount ? spec.discountCode : null,
      JSON.stringify({ ...FIXTURE_ADDRESS, fullName: user.name }),
      new Date(created.getTime() + 3 * DAY).toISOString().slice(0, 10),
      created,
    ],
  );
  for (const p of products.rows) {
    await client.query('INSERT INTO order_items (order_id, product_id, name, unit_price_cents, quantity) VALUES ($1, $2, $3, $4, 1)', [
      o.rows[0].id,
      p.id,
      p.name,
      p.price_cents,
    ]);
  }
  return {
    id: o.rows[0].id,
    number: o.rows[0].number,
    status: o.rows[0].status,
    createdAt: o.rows[0].created_at,
    totalCents: totals.totalCents,
  };
}

function publicFixtureUser(user: any) {
  return { id: user.id, email: user.email, name: user.name, password: SEED_PASSWORD };
}

async function customerWithOrders(client: PoolClient) {
  const user = await createUser(client, { name: 'Olivia Orders', email: uniqueEmail('orders') });
  const orders = [];
  for (const spec of [
    { daysAgo: 20, status: 'delivered', skus: ['BK-001'] },
    { daysAgo: 5, status: 'shipped', skus: ['HK-005', 'CL-005'] },
    { daysAgo: 1, status: 'paid', skus: ['CL-005'] },
  ]) {
    orders.push(await insertOrder(client, user, spec));
  }
  return { user: publicFixtureUser(user), orders: orders.reverse() };
}

async function ordersForAdmin(client: PoolClient) {
  const nora = await createUser(client, { name: 'Nora Grid', email: uniqueEmail('nora') });
  const liam = await createUser(client, { name: 'Liam Grid', email: uniqueEmail('liam') });
  const specs: (FixtureOrder & { user: any })[] = [
    { user: nora, daysAgo: 30, status: 'delivered', skus: ['BK-002'] },
    { user: liam, daysAgo: 28, status: 'delivered', skus: ['SP-001', 'SP-003'] },
    { user: nora, daysAgo: 21, status: 'cancelled', skus: ['EL-007'] },
    { user: liam, daysAgo: 14, status: 'shipped', skus: ['HK-001'], discountCode: 'SAVE10' },
    { user: nora, daysAgo: 12, status: 'shipped', skus: ['CL-002', 'CL-006'] },
    { user: liam, daysAgo: 10, status: 'shipped', skus: ['BK-004'] },
    { user: nora, daysAgo: 7, status: 'processing', skus: ['EL-001'] },
    { user: liam, daysAgo: 5, status: 'processing', skus: ['HK-002', 'HK-005'] },
    { user: nora, daysAgo: 4, status: 'processing', skus: ['SP-006'] },
    { user: liam, daysAgo: 3, status: 'paid', skus: ['CL-003'], discountCode: 'SAVE10' },
    { user: nora, daysAgo: 2, status: 'paid', skus: ['BK-008', 'HK-008'] },
    { user: liam, daysAgo: 1, status: 'paid', skus: ['EL-003'] },
  ];
  const orders = [];
  for (const { user, ...spec } of specs) orders.push({ ...(await insertOrder(client, user, spec)), customerEmail: user.email });
  return { customers: [publicFixtureUser(nora), publicFixtureUser(liam)], orders: orders.reverse() };
}

async function customerWithWishlist(client: PoolClient) {
  const user = await createUser(client, { name: 'Willa Wishlist', email: uniqueEmail('wishlist') });
  const skus = ['EL-002', 'BK-002', 'HK-003', 'SP-004'];
  const items = [];
  for (let i = 0; i < skus.length; i++) {
    const p = await client.query('SELECT id, name FROM products WHERE sku = $1', [skus[i]]);
    await client.query('INSERT INTO wishlist_items (user_id, product_id, position, added_at) VALUES ($1, $2, $3, $4)', [
      user.id,
      p.rows[0].id,
      i,
      clock.now(),
    ]);
    items.push({ productId: p.rows[0].id, name: p.rows[0].name, position: i });
  }
  return { user: publicFixtureUser(user), items };
}

// A 1x1 green PNG.
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function customerWithAvatar(client: PoolClient) {
  const user = await createUser(client, { name: 'Ava Avatar', email: uniqueEmail('avatar') });
  await client.query('INSERT INTO avatars (user_id, content_type, data, updated_at) VALUES ($1, $2, $3, $4)', [
    user.id,
    'image/png',
    TINY_PNG,
    clock.now(),
  ]);
  return { user: publicFixtureUser(user), avatarUrl: `/api/v1/users/${user.id}/avatar` };
}

async function productWithReviews(client: PoolClient) {
  const product = await client.query("SELECT id, name FROM products WHERE sku = 'EL-001'");
  const reviews = [
    { name: 'Róisín Review', rating: 5, title: 'Brilliant sound', body: 'Battery lasts for days. Would buy again.' },
    { name: 'Tadhg Tester', rating: 4, title: 'Good, not perfect', body: 'The case is a bit bulky.' },
    { name: 'Mallory Markup', rating: 2, title: '<b>Bold claim</b>', body: "<script>alert('xss')</script> This text must show as text." },
  ];
  const created = [];
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    const user = await createUser(client, { name: r.name, email: uniqueEmail('reviewer') });
    const row = await client.query(
      'INSERT INTO reviews (product_id, user_id, rating, title, body, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [product.rows[0].id, user.id, r.rating, r.title, r.body, new Date(clock.nowMs() - (reviews.length - i) * DAY)],
    );
    created.push({ id: row.rows[0].id, rating: r.rating, title: r.title, author: r.name });
  }
  return { product: { id: product.rows[0].id, name: product.rows[0].name }, reviews: created.reverse(), average: 3.7 };
}

export const FIXTURES: Record<string, (client: PoolClient) => Promise<unknown>> = {
  'customer-with-orders': customerWithOrders,
  'orders-for-admin': ordersForAdmin,
  'customer-with-wishlist': customerWithWishlist,
  'customer-with-avatar': customerWithAvatar,
  'product-with-reviews': productWithReviews,
  'out-of-stock-product': (c) => upsertProduct(c, 'FX-OOS', 'Sold Out Synthesiser', 0),
  'low-stock-product': (c) => upsertProduct(c, 'FX-LOW', 'Last One Lamp', 1),
  'expired-discount': (c) =>
    upsertCode(c, {
      code: 'EXPIRED10',
      description: 'Expired 10% code',
      type: 'percent',
      value: 10,
      expiresAt: new Date(clock.nowMs() - DAY),
    }),
  'future-discount': (c) =>
    upsertCode(c, {
      code: 'FUTURE10',
      description: 'Not yet active 10% code',
      type: 'percent',
      value: 10,
      startsAt: new Date(clock.nowMs() + 7 * DAY),
    }),
  'single-use-discount': (c) =>
    upsertCode(c, { code: 'ONCE15', description: 'Single-use 15% code', type: 'percent', value: 15, singleUse: true }),
  'used-discount': (c) =>
    upsertCode(c, {
      code: 'USED10',
      description: 'Already used single-use code',
      type: 'percent',
      value: 10,
      singleUse: true,
      usedCount: 1,
    }),
  'min-spend-discount': (c) =>
    upsertCode(c, { code: 'MIN50', description: '10% off when you spend €50', type: 'percent', value: 10, minSpendCents: 5000 }),
};
