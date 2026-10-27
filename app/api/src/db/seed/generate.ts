import crypto from 'crypto';
import { PoolClient } from 'pg';
import { conflict } from '../../lib/errors';
import { calculateTotals } from '../../lib/pricing';
import { getSeedPasswordHash } from './base';

export interface GenerateOptions {
  products: number;
  users: number;
  ordersPerUser: number;
  seed: number;
}

const DAY = 86_400_000;
// A fixed date, not the clock, so the same seed gives the same timestamps on any day.
const BASE_TIME = Date.UTC(2026, 0, 1);
const STATUSES = ['delivered', 'delivered', 'delivered', 'shipped', 'paid', 'processing', 'cancelled'];
const ADJECTIVES = ['Compact', 'Classic', 'Deluxe', 'Everyday', 'Premium', 'Portable', 'Smart', 'Essential', 'Rugged', 'Slim'];
const NOUNS = ['Lamp', 'Kettle', 'Backpack', 'Notebook', 'Speaker', 'Jacket', 'Bottle', 'Keyboard', 'Mat', 'Blender', 'Cable', 'Mug'];

/** Small seeded generator (mulberry32). The same seed always gives the same sequence. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(6, '0');

export function generatedEmail(seed: number, n: number): string {
  return `gen-${seed}-${pad(n)}@playlab.test`;
}

/** Adds generated products, users and orders on top of whatever is there. Responds 409 `GENERATE_CONFLICT` if this seed was already used. */
export async function generateData(client: PoolClient, opts: GenerateOptions) {
  const rand = rng(opts.seed);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const tag = `G${opts.seed}`;

  const taken = await client.query('SELECT 1 FROM users WHERE email = $1 UNION ALL SELECT 1 FROM products WHERE sku = $2 LIMIT 1', [
    generatedEmail(opts.seed, 1),
    `${tag}-${pad(1)}`,
  ]);
  if (taken.rowCount) throw conflict('GENERATE_CONFLICT', `Data for seed ${opts.seed} already exists. Reset first, or use another seed`);

  const cats = (await client.query('SELECT id FROM categories ORDER BY id')).rows.map((r: any) => r.id as number);

  const sku: string[] = [];
  const name: string[] = [];
  const category: number[] = [];
  const price: number[] = [];
  const stock: number[] = [];
  const createdAt: Date[] = [];
  for (let i = 1; i <= opts.products; i++) {
    sku.push(`${tag}-${pad(i)}`);
    name.push(`${ADJECTIVES[int(0, ADJECTIVES.length - 1)]} ${NOUNS[int(0, NOUNS.length - 1)]} ${i}`);
    category.push(cats[int(0, cats.length - 1)]);
    price.push(int(5, 500) * 100 - 1);
    stock.push(int(0, 200));
    createdAt.push(new Date(BASE_TIME - int(1, 365) * DAY));
  }
  await client.query(
    `INSERT INTO products (sku, name, description, category_id, price_cents, stock, image_url, created_at, updated_at)
     SELECT s, n, 'Generated test product.', c, p, st, '/img/electronics.svg', t, t
       FROM unnest($1::text[], $2::text[], $3::int[], $4::int[], $5::int[], $6::timestamptz[]) AS g(s, n, c, p, st, t)`,
    [sku, name, category, price, stock, createdAt],
  );

  const hash = getSeedPasswordHash();
  const emails = Array.from({ length: opts.users }, (_, i) => generatedEmail(opts.seed, i + 1));
  const userIds = (
    await client.query(
      `INSERT INTO users (email, name, password_hash, role, email_verified, created_at)
       SELECT e, 'Generated User ' || ord, $2, 'customer', TRUE, $3
         FROM unnest($1::text[]) WITH ORDINALITY AS g(e, ord)
       RETURNING id, email`,
      [emails, hash, new Date(BASE_TIME)],
    )
  ).rows
    .sort((a: any, b: any) => a.id - b.id)
    .map((r: any) => r.id as number);

  // Orders buy the generated products, or the seed catalogue when none were generated.
  const pool = (await client.query('SELECT id, name, price_cents FROM products ORDER BY id')).rows as {
    id: number;
    name: string;
    price_cents: number;
  }[];
  const shipping = JSON.stringify({
    fullName: 'Generated User',
    line1: '1 Grafton Street',
    line2: '',
    city: 'Dublin 2',
    county: 'Dublin',
    postcode: 'D02 XY45',
    country: 'IE',
    phone: '',
  });

  const orders: {
    user: number;
    status: string;
    totals: ReturnType<typeof calculateTotals>;
    created: Date;
    items: { id: number; name: string; price: number; qty: number }[];
  }[] = [];
  for (const user of userIds) {
    for (let k = 0; k < opts.ordersPerUser; k++) {
      const items = Array.from({ length: int(1, 3) }, () => {
        const p = pool[int(0, pool.length - 1)];
        return { id: p.id, name: p.name, price: p.price_cents, qty: int(1, 3) };
      });
      // The same product twice in one order would break the (order, product) key.
      const unique = [...new Map(items.map((i) => [i.id, i])).values()];
      orders.push({
        user,
        status: STATUSES[int(0, STATUSES.length - 1)],
        totals: calculateTotals(
          unique.map((i) => ({ unitPriceCents: i.price, quantity: i.qty })),
          null,
        ),
        created: new Date(BASE_TIME - int(0, 90) * DAY),
        items: unique,
      });
    }
  }

  if (orders.length) {
    const numbers = (
      await client.query(`SELECT 'PL-' || lpad(nextval('order_number_seq')::text, 6, '0') AS number FROM generate_series(1, $1::int)`, [
        orders.length,
      ])
    ).rows.map((r: any) => r.number as string);
    const col = <T>(f: (o: (typeof orders)[number]) => T) => orders.map(f);
    const inserted = await client.query(
      `INSERT INTO orders (number, user_id, status, subtotal_cents, discount_cents, vat_cents, delivery_cents, total_cents,
                           shipping, delivery_date, card_last4, created_at)
       SELECT n, u, s, sub, 0, vat, del, tot, $9::jsonb, (c::date + 3), '4242', c
         FROM unnest($1::text[], $2::int[], $3::text[], $4::int[], $5::int[], $6::int[], $7::int[], $8::timestamptz[])
              AS g(n, u, s, sub, vat, del, tot, c)
       RETURNING id, number`,
      [
        numbers,
        col((o) => o.user),
        col((o) => o.status),
        col((o) => o.totals.subtotalCents),
        col((o) => o.totals.vatCents),
        col((o) => o.totals.deliveryCents),
        col((o) => o.totals.totalCents),
        col((o) => o.created),
        shipping,
      ],
    );
    const idByNumber = new Map(inserted.rows.map((r: any) => [r.number as string, r.id as number]));
    const itemRows = orders.flatMap((o, i) => o.items.map((it) => ({ order: idByNumber.get(numbers[i])!, ...it })));
    await client.query(
      `INSERT INTO order_items (order_id, product_id, name, unit_price_cents, quantity)
       SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::int[], $5::int[])`,
      [
        itemRows.map((r) => r.order),
        itemRows.map((r) => r.id),
        itemRows.map((r) => r.name),
        itemRows.map((r) => r.price),
        itemRows.map((r) => r.qty),
      ],
    );
  }

  return { products: opts.products, users: opts.users, orders: orders.length, ...(await checksum(client, opts.seed)) };
}

/** A hash of everything generated for this seed, so two runs can be compared without reading 10,000 rows. */
async function checksum(client: PoolClient, seed: number) {
  const h = crypto.createHash('sha256');
  const parts = [
    [`SELECT sku, name, category_id, price_cents, stock, created_at FROM products WHERE sku LIKE $1 ORDER BY sku`, `G${seed}-%`],
    [`SELECT email, name, role, created_at FROM users WHERE email LIKE $1 ORDER BY email`, `gen-${seed}-%`],
    [
      `SELECT o.number, u.email, o.status, o.total_cents, o.created_at,
              (SELECT string_agg(p.sku || 'x' || i.quantity, ',' ORDER BY p.sku) FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = o.id) AS items
         FROM orders o JOIN users u ON u.id = o.user_id WHERE u.email LIKE $1 ORDER BY o.number`,
      `gen-${seed}-%`,
    ],
  ] as const;
  for (const [sql, like] of parts) h.update(JSON.stringify((await client.query(sql, [like])).rows));
  return { checksum: h.digest('hex') };
}
