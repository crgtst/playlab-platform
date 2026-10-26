import { APIRequestContext, expect, request as playwrightRequest } from '@playwright/test';
import { product } from './data';
import { API_URL } from './env';
import type { TestUser } from './hooks';

const productsUrl = `${API_URL}/api/v1/products`;

export interface CatalogueProduct {
  id: number;
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
}

/** A product only this test knows about, so editing it cannot disturb another test. Delete it afterwards unless it was ordered. */
export async function createProduct(
  request: APIRequestContext,
  admin: TestUser,
  fields: { priceCents?: number; stock?: number } = {},
): Promise<CatalogueProduct> {
  const unique = `PW-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const response = await request.post(productsUrl, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      sku: unique,
      name: `Test product ${unique}`,
      description: 'Temporary product created by a test',
      category: 'books',
      priceCents: fields.priceCents ?? 1999,
      stock: fields.stock ?? 5,
    },
  });
  expect(response.status(), 'Create a product for the test').toBe(201);
  return ((await response.json()) as { data: CatalogueProduct }).data;
}

/** The product as the API shows it now, with the ETag that goes in If-Match. */
export async function getProduct(
  request: APIRequestContext,
  id: number,
): Promise<{ product: CatalogueProduct & Record<string, unknown>; etag: string }> {
  const response = await request.get(`${productsUrl}/${id}`);
  expect(response.status(), `Read product ${id}`).toBe(200);
  return {
    product: ((await response.json()) as { data: CatalogueProduct & Record<string, unknown> }).data,
    etag: response.headers()['etag'],
  };
}

export async function updateProduct(
  request: APIRequestContext,
  admin: TestUser,
  id: number,
  etag: string,
  changes: Record<string, unknown>,
) {
  return request.patch(`${productsUrl}/${id}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}`, 'If-Match': etag },
    data: changes,
  });
}

export async function deleteProduct(request: APIRequestContext, admin: TestUser, id: number) {
  const response = await request.delete(`${productsUrl}/${id}`, { headers: { Authorization: `Bearer ${admin.accessToken}` } });
  expect(response.status(), 'Delete the test product').toBe(204);
}

/** Puts a seeded product's stock back to its seeded level, for tests that use stock up for good. Call from `afterAll`. */
export async function restoreStock(sku: string) {
  const seeded = product(sku);
  const api = await playwrightRequest.newContext();
  try {
    const created = await api.post(`${API_URL}/test/users`, { data: { role: 'admin' } });
    expect(created.status()).toBe(201);
    const { accessToken } = (await created.json()) as { accessToken: string };
    const response = await api.patch(`${productsUrl}/${seeded.id}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'If-Match': '*' },
      data: { stock: seeded.stock },
    });
    expect(response.status(), `Restore stock of ${sku}`).toBe(200);
  } finally {
    await api.dispose();
  }
}
