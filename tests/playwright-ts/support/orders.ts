import { APIRequestContext, expect } from '@playwright/test';
import { cards, product } from './data';
import { API_URL } from './env';
import type { TestUser } from './hooks';

const ordersUrl = `${API_URL}/api/v1/orders`;

export interface TestOrder {
  id: number;
  number: string;
  status: string;
  etag: string;
}

/** Places an order for one unit of the product with this SKU, as the given user, through the API. */
export async function createOrder(request: APIRequestContext, user: TestUser, sku: string): Promise<TestOrder> {
  const headers = { Authorization: `Bearer ${user.accessToken}` };
  const added = await request.post(`${API_URL}/api/v1/cart/items`, { headers, data: { productId: product(sku).id, quantity: 1 } });
  expect(added.status(), 'Add product to the isolated customer cart').toBe(201);
  const placed = await request.post(ordersUrl, {
    headers,
    data: {
      shipping: { fullName: 'Browser Test Customer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' },
      deliveryDate: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
      payment: { nameOnCard: 'Casey Customer', cardNumber: cards.success.number.replaceAll(' ', ''), expiry: '12/30', cvc: '123' },
    },
  });
  expect(placed.status(), 'Place isolated test order').toBe(201);
  return ((await placed.json()) as { data: TestOrder }).data;
}

/** Moves an order to a new status as an admin; returns the order with its new ETag. */
export async function setOrderStatus(request: APIRequestContext, admin: TestUser, order: TestOrder, status: string): Promise<TestOrder> {
  const response = await request.patch(`${ordersUrl}/${order.id}/status`, {
    headers: { Authorization: `Bearer ${admin.accessToken}`, 'If-Match': order.etag },
    data: { status },
  });
  expect(response.status(), `Move ${order.number} to ${status}`).toBe(200);
  return ((await response.json()) as { data: TestOrder }).data;
}

/** Cancels the order as an admin, from any status that allows it, which puts the stock back. */
export async function cancelOrder(request: APIRequestContext, admin: TestUser, order: TestOrder) {
  const response = await request.patch(`${ordersUrl}/${order.id}/status`, {
    headers: { Authorization: `Bearer ${admin.accessToken}`, 'If-Match': '*' },
    data: { status: 'cancelled' },
  });
  expect(response.status(), `Cancel ${order.number} and restore product stock`).toBe(200);
}
