import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { pool } from '../pool';
import { categories, products } from './products';

export const SEED_PASSWORD = 'Password123!';

export const seedUsers = [
  { email: 'customer@playlab.test', name: 'Casey Customer', role: 'customer' },
  { email: 'admin@playlab.test', name: 'Alex Admin', role: 'admin' },
  { email: 'support@playlab.test', name: 'Sam Support', role: 'support' },
] as const;

export const seedDiscounts = [
  { code: 'SAVE10', description: '10% off your order', type: 'percent', value: 10, minSpendCents: 0 },
  { code: 'FIXED20', description: '€20 off your order', type: 'fixed', value: 2000, minSpendCents: 0 },
] as const;

// Products are created on consecutive days from this date so "newest" order is stable.
const CATALOGUE_EPOCH = Date.UTC(2026, 0, 1);

// Hashing is the slow part of a reset, so do it once per process.
let seedPasswordHash: string | null = null;
export function getSeedPasswordHash(): string {
  if (!seedPasswordHash) seedPasswordHash = bcrypt.hashSync(SEED_PASSWORD, 10);
  return seedPasswordHash;
}

const TABLES = [
  'wishlist_items', 'avatars', 'order_items', 'orders', 'payment_intents', 'cart_items', 'carts', 'discount_codes', 'products',
  'categories', 'mailbox', 'email_tokens', 'refresh_tokens', 'users',
];

export async function truncateAll(client: PoolClient): Promise<void> {
  await client.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  await client.query('ALTER SEQUENCE order_number_seq RESTART WITH 1');
}

export async function seedBase(client: PoolClient): Promise<void> {
  const hash = getSeedPasswordHash();
  for (const u of seedUsers) {
    await client.query(
      `INSERT INTO users (email, name, password_hash, role, email_verified) VALUES ($1, $2, $3, $4, TRUE)`,
      [u.email, u.name, hash, u.role],
    );
  }

  const categoryIds = new Map<string, number>();
  for (const c of categories) {
    const rows = await client.query(`INSERT INTO categories (slug, name) VALUES ($1, $2) RETURNING id`, [c.slug, c.name]);
    categoryIds.set(c.slug, rows.rows[0].id);
  }

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const createdAt = new Date(CATALOGUE_EPOCH + i * 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO products (sku, name, description, category_id, price_cents, stock, image_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [p.sku, p.name, p.description, categoryIds.get(p.category), p.priceCents, p.stock, `/img/${p.category}.svg`, createdAt],
    );
  }

  for (const d of seedDiscounts) {
    await client.query(
      `INSERT INTO discount_codes (code, description, type, value, min_spend_cents) VALUES ($1, $2, $3, $4, $5)`,
      [d.code, d.description, d.type, d.value, d.minSpendCents],
    );
  }
}

export async function resetDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await truncateAll(client);
    await seedBase(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function seedIfEmpty(): Promise<boolean> {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) return false;
  await resetDatabase();
  return true;
}
