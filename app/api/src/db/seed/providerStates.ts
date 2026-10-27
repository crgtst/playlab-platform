import { PoolClient } from 'pg';
import { events } from '../../lib/events';
import { notFound, validationError } from '../../lib/errors';
import { createUser, FIXTURES } from './fixtures';
import { SEED_PASSWORD } from './base';

/**
 * Pact provider states: the sentences a consumer contract uses ("product 6 has stock 3") mapped to the data they need.
 * Matching ignores case and extra spaces. Add a state here and it shows up in `GET /test/provider-states`.
 */
interface ProviderState {
  /** One example sentence, shown in the listing. */
  example: string;
  pattern: RegExp;
  run: (client: PoolClient, match: RegExpMatchArray) => Promise<unknown>;
}

async function setStock(client: PoolClient, id: number, stock: number) {
  const { rows } = await client.query('UPDATE products SET stock = $2, updated_at = now() WHERE id = $1 RETURNING id, sku, stock', [
    id,
    stock,
  ]);
  if (!rows[0])
    throw validationError(
      [{ field: 'state', message: `Product ${id} does not exist` }],
      `Provider state failed: product ${id} does not exist`,
    );
  events.emitEvent('stockChanged', { productId: rows[0].id, stock: rows[0].stock });
  return { productId: rows[0].id, sku: rows[0].sku, stock: rows[0].stock };
}

async function accountWith(client: PoolClient, role: string) {
  const user = await createUser(client, { role, name: `Provider ${role}` });
  return { email: user.email, password: SEED_PASSWORD, role };
}

const STATES: ProviderState[] = [
  {
    example: 'product 6 has stock 3',
    pattern: /^product (\d+) has stock (\d+)$/,
    run: (c, m) => setStock(c, Number(m[1]), Number(m[2])),
  },
  {
    example: 'product 6 is out of stock',
    pattern: /^product (\d+) is out of stock$/,
    run: (c, m) => setStock(c, Number(m[1]), 0),
  },
  {
    example: 'product 6 exists',
    pattern: /^product (\d+) exists$/,
    run: async (c, m) => {
      const { rows } = await c.query('SELECT id, sku, stock FROM products WHERE id = $1', [Number(m[1])]);
      if (!rows[0])
        throw validationError(
          [{ field: 'state', message: `Product ${m[1]} does not exist` }],
          `Provider state failed: product ${m[1]} does not exist`,
        );
      return { productId: rows[0].id, sku: rows[0].sku, stock: rows[0].stock };
    },
  },
  {
    example: 'the catalogue has products',
    pattern: /^the catalogue has products$/,
    run: async (c) => ({ products: (await c.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n }),
  },
  { example: 'a customer exists', pattern: /^a customer exists$/, run: (c) => accountWith(c, 'customer') },
  { example: 'an admin exists', pattern: /^an admin exists$/, run: (c) => accountWith(c, 'admin') },
  {
    example: 'fixture customer-with-orders',
    pattern: /^fixture ([a-z0-9-]+)$/,
    run: async (c, m) => {
      if (!FIXTURES[m[1]]) throw notFound(`There is no fixture called "${m[1]}"`);
      return FIXTURES[m[1]](c);
    },
  },
];

export const providerStateExamples = () => STATES.map((s) => s.example);

const normalise = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** Finds the state for each name, or returns the names nothing matches. */
export function resolveStates(names: string[]) {
  const found: { name: string; state: ProviderState; match: RegExpMatchArray }[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const text = normalise(name);
    const state = STATES.find((s) => s.pattern.test(text));
    if (state) found.push({ name, state, match: text.match(state.pattern)! });
    else unknown.push(name);
  }
  return { found, unknown };
}
