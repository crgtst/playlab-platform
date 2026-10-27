import { API_URL, expect, test } from '../support/fixtures';
import { discounts, productId } from '../support/data';
import { bearer } from '../support/jwt';
import { CARD, SHIPPING, cancelAsAdmin, deliveryDate } from '../support/orders';
import type { APIRequestContext } from '@playwright/test';
import type { TestHooks, TestUser } from '../support/hooks';

/**
 * OWASP API6:2023 Unrestricted Access to Sensitive Business Flows: a single-use code is single use even when two
 * orders use it at the same moment. PLS-24.9
 */
test.describe('API6 sensitive business flows', () => {
  // Both tests reset the one ONCE15 code through /test/seed, so they take turns.
  test.describe.configure({ mode: 'serial' });
  const code = discounts.fromFixtures.find((entry) => entry.fixture === 'single-use-discount')!.code;

  async function raceForCode(request: APIRequestContext, hooks: TestHooks) {
    const seeded = await request.post(`${API_URL}/test/seed`, { data: { fixtures: ['single-use-discount'] } });
    expect(seeded.status()).toBe(201);
    const admin = await hooks.createUser('admin');
    const shoppers: TestUser[] = [await hooks.createUser(), await hooks.createUser()];
    for (const shopper of shoppers) {
      const headers = bearer(shopper.accessToken);
      await request.post(`${API_URL}/api/v1/cart/items`, { headers, data: { productId: productId('BK-003'), quantity: 1 } });
      expect(
        (await request.post(`${API_URL}/api/v1/cart/discount`, { headers, data: { code } })).status(),
        `${code} on ${shopper.email}'s cart`,
      ).toBe(200);
    }
    // At the same moment: both orders are sent before either answer is read.
    const responses = await Promise.all(
      shoppers.map((shopper) =>
        request.post(`${API_URL}/api/v1/orders`, {
          headers: bearer(shopper.accessToken),
          data: { shipping: SHIPPING, deliveryDate: deliveryDate(), payment: CARD },
        }),
      ),
    );
    const placed = await Promise.all(
      responses.filter((r) => r.status() === 201).map(async (r) => ((await r.json()) as { data: { id: number; discount: unknown } }).data),
    );
    return { admin, placed, discounted: placed.filter((order) => order.discount) };
  }

  test('PLS-24.9 only one of two orders placed at the same moment gets the single-use discount', async ({ request, hooks }) => {
    const { admin, placed, discounted } = await raceForCode(request, hooks);
    try {
      expect(placed.length).toBeGreaterThan(0);
      expect(discounted).toHaveLength(1);
    } finally {
      for (const order of placed) await cancelAsAdmin(request, admin, order);
    }
  });

  test('PLS-24.9 defect single-use-reused gives both orders the discount', async ({ request, hooks }) => {
    await hooks.enableDefects('single-use-reused');
    const { admin, placed, discounted } = await raceForCode(request, hooks);
    try {
      expect(discounted).toHaveLength(2);
    } finally {
      for (const order of placed) await cancelAsAdmin(request, admin, order);
    }
  });
});
