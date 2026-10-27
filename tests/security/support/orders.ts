import { APIRequestContext, expect } from '@playwright/test';
import { API_URL } from './env';
import { bearer } from './jwt';
import type { TestUser } from './hooks';

export const SHIPPING = { fullName: 'Casey Customer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' };
export const CARD = { nameOnCard: 'Casey Customer', cardNumber: '4242424242424242', expiry: '12/30', cvc: '123' };
export const deliveryDate = () => new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

export interface PlacedOrder {
  id: number;
  number: string;
  status: string;
}

/** Puts one unit of a product in the user's cart. */
export async function addToCart(request: APIRequestContext, user: TestUser, productId: number) {
  const added = await request.post(`${API_URL}/api/v1/cart/items`, { headers: bearer(user.accessToken), data: { productId, quantity: 1 } });
  expect(added.status(), 'Add the product to the cart').toBe(201);
}

/** Places an order for one unit of a product. `extra` is merged into the body, for example an address suggestion id. */
export function placeOrder(request: APIRequestContext, user: TestUser, extra: Record<string, unknown> = {}) {
  return request.post(`${API_URL}/api/v1/orders`, {
    headers: bearer(user.accessToken),
    data: { shipping: SHIPPING, deliveryDate: deliveryDate(), payment: CARD, ...extra },
  });
}

/** Adds the product to the cart and orders it. Expects 201. */
export async function createOrder(request: APIRequestContext, user: TestUser, productId: number): Promise<PlacedOrder> {
  await addToCart(request, user, productId);
  const placed = await placeOrder(request, user);
  expect(placed.status(), 'Place the order').toBe(201);
  return ((await placed.json()) as { data: PlacedOrder }).data;
}

/** Cancels an order as an admin, which puts its stock back, so a test leaves the catalogue as it found it. */
export async function cancelAsAdmin(request: APIRequestContext, admin: TestUser, order: { id: number }) {
  await request.patch(`${API_URL}/api/v1/orders/${order.id}/status`, {
    headers: { ...bearer(admin.accessToken), 'If-Match': '*' },
    data: { status: 'cancelled' },
  });
}

/**
 * A product of the test's own, created by an admin. A test that needs to know exactly who has bought a product uses one, because
 * the seeded products have orders from every earlier test. Its name starts with "zz", so it sorts after the seeded ones.
 */
export async function createProduct(request: APIRequestContext, admin: TestUser, stock = 5): Promise<number> {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const created = await request.post(`${API_URL}/api/v1/products`, {
    headers: bearer(admin.accessToken),
    data: {
      sku: `SEC-${unique}`,
      name: `zz Security test product ${unique}`,
      description: 'Made by the security suite.',
      category: 'books',
      priceCents: 1999,
      stock,
    },
  });
  expect(created.status(), "Create a product of the test's own").toBe(201);
  return ((await created.json()) as { data: { id: number } }).data.id;
}
