import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSchemaFiles, SCHEMAS_DIR } from '../scripts/export-schemas';
import { SEED_PASSWORD, seedDiscounts, seedUsers } from '../src/db/seed/base';
import { FIXTURES } from '../src/db/seed/fixtures';
import { categories, products } from '../src/db/seed/products';
import { cardSchema } from '../src/lib/cardSchema';
import { luhnValid, TEST_CARDS } from '../src/lib/payments';

// tests/shared/ is the data contract every suite reads instead of hard-coding accounts, products, cards and fixtures.
// These checks keep it in step with the app, so a change to the seed data fails here rather than in every suite.

const SHARED = path.join(__dirname, '../../../tests/shared');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(SHARED, file), 'utf8'));

describe('tests/shared data contract', () => {
  it('accounts.json lists the seeded accounts', () => {
    const expected = Object.fromEntries(
      seedUsers.map((u) => [u.role, { email: u.email, password: SEED_PASSWORD, name: u.name, role: u.role }]),
    );
    expect(read('accounts.json')).toEqual(expected);
  });

  it('products.json lists the seeded catalogue, with the ids a reset gives', () => {
    expect(read('products.json')).toEqual({
      categories,
      products: products.map((p, i) => ({
        id: i + 1,
        sku: p.sku,
        name: p.name,
        category: p.category,
        priceCents: p.priceCents,
        stock: p.stock,
      })),
    });
  });

  it('cards.json has the test cards, and the defaults make a valid card with each of them', () => {
    const cards = read('cards.json');
    const digits = (n: string) => n.replace(/ /g, '');
    expect({ success: digits(cards.success.number), decline: digits(cards.decline.number), timeout: digits(cards.timeout.number) }).toEqual(
      TEST_CARDS,
    );
    expect(luhnValid(digits(cards.invalid.number))).toBe(false);
    for (const name of ['success', 'decline', 'timeout']) {
      expect(cardSchema.safeParse({ ...cards.defaults, cardNumber: cards[name].number }).success).toBe(true);
    }
  });

  it('discounts.json lists the seeded codes, and each fixture code names a real fixture', () => {
    const discounts = read('discounts.json');
    expect(discounts.seeded).toEqual(
      seedDiscounts.map((d) => ({
        code: d.code,
        type: d.type,
        value: d.value,
        minSpendCents: d.minSpendCents,
        description: d.description,
      })),
    );
    for (const d of discounts.fromFixtures) expect(Object.keys(FIXTURES)).toContain(d.fixture);
  });

  it('fixtures.json names every fixture, in order', () => {
    expect(read('fixtures.json').map((f: { name: string }) => f.name)).toEqual(Object.keys(FIXTURES));
  });

  it('schemas/ matches the OpenAPI file (run "npm run export:schemas" after editing it)', () => {
    const expected = buildSchemaFiles();
    const actual = new Map(fs.readdirSync(SCHEMAS_DIR).map((f) => [f, fs.readFileSync(path.join(SCHEMAS_DIR, f), 'utf8')]));
    expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [name, body] of expected) expect(actual.get(name), name).toBe(body);
  });

  it('load-model.json stays inside what the API accepts and names ACs that exist', () => {
    const model = read('load-model.json');
    const md = fs.readFileSync(path.join(__dirname, '../../../docs/ACCEPTANCE_CRITERIA.md'), 'utf8');
    // POST /test/generate takes up to 50,000 products, 5,000 users and 20 orders each; POST /test/users/bulk up to 5,000.
    expect(model.data.products).toBeLessThanOrEqual(50_000);
    expect(model.data.users).toBeLessThanOrEqual(5_000);
    expect(model.data.ordersPerUser).toBeLessThanOrEqual(20);
    for (const key of ['products', 'orders', 'soak', 'overload']) {
      expect(md, `${key}: ${model[key].ac}`).toContain(`| ${model[key].ac} |`);
    }
    // The AC text quotes the same figures, so the two cannot drift apart unnoticed.
    expect(md).toContain(`${model.products.rps} requests per second for 5 minutes, then p95 latency is under ${model.products.p95Ms} ms`);
    expect(md).toContain(`${model.orders.rps} requests per second for 5 minutes, then p95 latency is under ${model.orders.p95Ms} ms`);
  });
});
