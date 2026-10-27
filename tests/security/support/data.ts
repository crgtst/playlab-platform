// The shared data contract (tests/shared/): products and codes come from there, so no suite hard-codes a value the seed data could change.
import discounts from '../../shared/discounts.json';
import catalogue from '../../shared/products.json';

export { discounts };

/** The id of a seeded product by SKU. Throws if the SKU is not in products.json, so a typo fails loudly. */
export function productId(sku: string): number {
  const found = catalogue.products.find((p) => p.sku === sku);
  if (!found) throw new Error(`No product with SKU ${sku} in tests/shared/products.json`);
  return found.id;
}
