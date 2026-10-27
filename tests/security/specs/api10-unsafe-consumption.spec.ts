import { API_URL, expect, test } from '../support/fixtures';
import { productId } from '../support/data';
import { addToCart, cancelAsAdmin, placeOrder, SHIPPING } from '../support/orders';

/**
 * OWASP API10:2023 Unsafe Consumption of APIs: data from a third party (here the address suggestion service) is checked like
 * data typed by the user. PLS-24.14
 *
 * The suggestion service has one hostile answer on purpose: searching "overflow" returns an address with a 300-character line.
 */
test.describe('API10 unsafe consumption of APIs', () => {
  async function overflowSuggestion(request: import('@playwright/test').APIRequestContext) {
    const res = await request.get(`${API_URL}/api/v1/addresses/suggest`, { params: { q: 'overflow' } });
    expect(res.status()).toBe(200);
    const [suggestion] = ((await res.json()) as { data: { id: string; line1: string; city: string; postcode: string }[] }).data;
    expect(suggestion.line1, 'the hostile suggestion').toHaveLength(300);
    return suggestion;
  }
  const fromSuggestion = (s: { id: string; line1: string; city: string; postcode: string }) => ({
    shipping: { ...SHIPPING, line1: s.line1, city: s.city, postcode: s.postcode },
    addressSuggestionId: s.id,
  });

  test('PLS-24.14 an address chosen from a suggestion is validated like a typed one: a 300-character line is 422', async ({
    request,
    hooks,
  }) => {
    const user = await hooks.createUser();
    await addToCart(request, user, productId('BK-001'));
    const res = await placeOrder(request, user, fromSuggestion(await overflowSuggestion(request)));
    expect(res.status()).toBe(422);
    const { error } = (await res.json()) as { error: { details: { field: string }[] } };
    expect(error.details.map((d) => d.field)).toContain('shipping.line1');
  });

  test('PLS-24.14 defect trust-address-provider believes the suggestion and stores the 300-character line', async ({ request, hooks }) => {
    await hooks.enableDefects('trust-address-provider');
    const [user, admin] = [await hooks.createUser(), await hooks.createUser('admin')];
    await addToCart(request, user, productId('BK-001'));
    const res = await placeOrder(request, user, fromSuggestion(await overflowSuggestion(request)));
    expect(res.status()).toBe(201);
    const { data } = (await res.json()) as { data: { id: number; shipping: { line1: string } } };
    expect(data.shipping.line1).toHaveLength(300);
    await cancelAsAdmin(request, admin, data);
  });
});
