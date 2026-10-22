// The shared data contract (tests/shared/). Every suite reads accounts, products, cards and codes from there, so none
// of them hard-codes a value the app's seed data could change.
import accounts from '../../shared/accounts.json';
import cards from '../../shared/cards.json';
import discounts from '../../shared/discounts.json';
import fixtures from '../../shared/fixtures.json';
import catalogue from '../../shared/products.json';

export { accounts, cards, discounts, fixtures };
export const { categories, products } = catalogue;

export type Product = (typeof products)[number];

/** A seeded product by SKU. Throws if the SKU isn't in products.json, so a typo fails loudly. */
export function product(sku: string): Product {
  const found = products.find((p) => p.sku === sku);
  if (!found) throw new Error(`No product with SKU ${sku} in tests/shared/products.json`);
  return found;
}
