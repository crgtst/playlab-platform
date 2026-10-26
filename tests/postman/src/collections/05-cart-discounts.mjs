import { collection, folder, request } from '../dsl.mjs';

/** The arithmetic every cart must satisfy, to the cent (PLS-4.4 and PLS-5.10). */
const arithmetic = `
  const adds = (t) => t.subtotalCents - t.discountCents + t.vatCents + t.deliveryCents === t.totalCents;`;

export default collection('05 Cart and discount codes', 'PLS-4 and PLS-5 over the API: quantities, stock, exact totals, and every discount outcome.', [
  folder('Cart (PLS-4)', [
    request({
      name: 'Add a product to the cart',
      method: 'POST',
      path: '/api/v1/cart/items',
      as: 'customer:cart',
      body: '{"productId": {{productId}}, "quantity": 2}',
      pre: `pm.environment.set('productId', PL.product('EL-008').id);`,
      test: `${arithmetic}
        PL.status('PLS-4.1', 201, 'adding a product returns 201');
        PL.schema('PLS-4.1', 'Cart');
        PL.ac('PLS-4.1', 'the count and the line total are right', () => {
          const cart = PL.json();
          pm.expect(cart.itemCount).to.eql(2);
          pm.expect(cart.items[0].lineTotalCents).to.eql(2 * PL.product('EL-008').priceCents);
        });
        PL.ac('PLS-4.4', 'subtotal, VAT and delivery add up to the total, to the cent', () => pm.expect(adds(PL.json().totals)).to.be.true);`,
    }),
    request({
      name: 'A quantity of zero is refused',
      method: 'POST',
      path: '/api/v1/cart/items',
      as: 'customer:cart',
      body: '{"productId": {{productId}}, "quantity": 0}',
      test: `
        PL.status('PLS-4.2', 422, 'quantity 0 returns 422');
        PL.ac('PLS-4.2', 'the error is on the quantity field', () => pm.expect(PL.json().error.details[0].field).to.eql('quantity'));`,
    }),
    request({
      name: 'A negative quantity is refused',
      method: 'POST',
      path: '/api/v1/cart/items',
      as: 'customer:cart',
      body: '{"productId": {{productId}}, "quantity": -1}',
      test: `
        PL.status('PLS-4.2', 422, 'quantity -1 returns 422');
        PL.ac('PLS-4.2', 'the cart is unchanged', async () => {
          pm.expect((await PL.call('GET', '/api/v1/cart', { as: 'customer:cart' })).json().itemCount).to.eql(2);
        });`,
    }),
    request({
      name: 'More than the stock is refused',
      method: 'POST',
      path: '/api/v1/cart/items',
      as: 'customer:cart',
      body: '{"productId": {{scarceId}}, "quantity": 4}',
      pre: `pm.environment.set('scarceId', PL.product('EL-006').id);`,
      test: `
        PL.status('PLS-4.3', 409, 'asking for more than the 3 in stock returns 409');
        PL.errorCode('PLS-4.3', 'INSUFFICIENT_STOCK');
        PL.ac('PLS-4.3', 'the error says how many are left', () => pm.expect(PL.json().error.details.available).to.eql(3));`,
    }),
    request({
      name: 'Change a quantity',
      method: 'PATCH',
      path: '/api/v1/cart/items/{{productId}}',
      as: 'customer:cart',
      body: '{"quantity": 3}',
      test: `${arithmetic}
        PL.status('PLS-4.1', 200, 'changing a quantity returns 200');
        PL.schema('PLS-4.1', 'Cart');
        PL.ac('PLS-4.4', 'the totals follow the new quantity, to the cent', () => {
          const cart = PL.json();
          pm.expect(cart.itemCount).to.eql(3);
          pm.expect(cart.totals.subtotalCents).to.eql(3 * PL.product('EL-008').priceCents);
          pm.expect(adds(cart.totals)).to.be.true;
        });`,
    }),
    request({
      name: 'Remove the item',
      method: 'DELETE',
      path: '/api/v1/cart/items/{{productId}}',
      as: 'customer:cart',
      test: `
        PL.status('PLS-4.1', 200, 'removing an item returns 200');
        PL.ac('PLS-4.1', 'the cart is empty and the totals are zero', () => {
          pm.expect(PL.json().items).to.eql([]);
          pm.expect(PL.json().totals.totalCents).to.eql(0);
        });`,
    }),
  ]),
  folder('Discount codes (PLS-5)', [
    request({
      name: 'Apply SAVE10',
      method: 'POST',
      path: '/api/v1/cart/discount',
      as: 'customer:disc',
      body: '{"code": "SAVE10"}',
      pre: `await PL.addToCart('customer:disc', 'EL-008', 2);`,
      test: `${arithmetic}
        PL.status('PLS-5.1', 200, 'a valid code returns 200');
        PL.schema('PLS-5.1', 'Cart');
        PL.ac('PLS-5.1', '10% comes off the subtotal', () => {
          const t = PL.json().totals;
          pm.expect(t.discountCents).to.eql(Math.round(t.subtotalCents * 0.1));
          pm.expect(PL.json().discount.code).to.eql('SAVE10');
        });
        PL.ac('PLS-5.8', 'VAT is worked out on the discounted subtotal', () => {
          const t = PL.json().totals;
          pm.expect(t.vatCents).to.eql(Math.round((t.subtotalCents - t.discountCents) * 0.23));
        });
        PL.ac('PLS-5.10', 'the grand total is the discounted subtotal plus VAT and delivery, to the cent', () => pm.expect(adds(PL.json().totals)).to.be.true);`,
    }),
    request({
      name: 'The same code in lower case is the same code',
      method: 'POST',
      path: '/api/v1/cart/discount',
      as: 'customer:disc',
      body: '{"code": "save10"}',
      test: `
        PL.status('PLS-5.7', 200, 'save10 is accepted like SAVE10');
        PL.ac('PLS-5.7', 'it is applied once, not twice', () => {
          pm.expect(PL.json().discounts).to.have.length(1);
          pm.expect(PL.json().discount.code).to.eql('SAVE10');
        });`,
    }),
    request({
      name: 'A second code is refused',
      method: 'POST',
      path: '/api/v1/cart/discount',
      as: 'customer:disc',
      body: '{"code": "FIXED20"}',
      test: `
        PL.status('PLS-5.4', 409, 'two codes cannot be stacked');
        PL.errorCode('PLS-5.4', 'DISCOUNT_ONE_PER_ORDER');
        PL.ac('PLS-5.4', 'the error says which code is already applied', () => pm.expect(PL.json().error.details.applied).to.eql('SAVE10'));`,
    }),
    request({
      name: 'Remove the code',
      method: 'DELETE',
      path: '/api/v1/cart/discount',
      as: 'customer:disc',
      test: `
        PL.status('PLS-5.1', 200, 'removing the code returns 200');
        PL.ac('PLS-5.1', 'the discount is gone and the total is back to full price', () => {
          pm.expect(PL.json().discount).to.be.null;
          pm.expect(PL.json().totals.discountCents).to.eql(0);
        });`,
    }),
    request({
      name: 'An unknown code',
      method: 'POST',
      path: '/api/v1/cart/discount',
      as: 'customer:disc',
      body: '{"code": "NOT-A-CODE"}',
      test: `
        PL.status('PLS-5.3', 422, 'an unknown code returns 422');
        PL.errorCode('PLS-5.3', 'DISCOUNT_UNKNOWN');`,
    }),
    request({
      name: 'An expired code',
      method: 'POST',
      path: '/api/v1/cart/discount',
      as: 'customer:disc',
      body: '{"code": "EXPIRED10"}',
      pre: `await PL.call('POST', '/test/seed', { body: { fixtures: ['expired-discount'] } });`,
      test: `
        PL.status('PLS-5.2', 422, 'an expired code returns 422');
        PL.errorCode('PLS-5.2', 'DISCOUNT_EXPIRED');
        PL.ac('PLS-5.2', 'the cart total is unchanged', async () => {
          pm.expect((await PL.call('GET', '/api/v1/cart', { as: 'customer:disc' })).json().totals.discountCents).to.eql(0);
        });`,
    }),
    request({
      name: 'A code with a minimum spend, on a small cart',
      method: 'POST',
      path: '/api/v1/cart/discount',
      as: 'customer:small',
      body: '{"code": "MIN50"}',
      pre: `
        await PL.call('POST', '/test/seed', { body: { fixtures: ['min-spend-discount'] } });
        await PL.addToCart('customer:small', 'SP-003', 1);`,
      test: `
        PL.status('PLS-5.5', 422, 'a cart under the minimum returns 422');
        PL.errorCode('PLS-5.5', 'DISCOUNT_MIN_SPEND');
        PL.ac('PLS-5.5', 'the error gives the minimum', () => pm.expect(PL.json().error.details.minSpendCents).to.eql(5000));`,
    }),
    request({
      name: 'A fixed code larger than the cart',
      method: 'POST',
      path: '/api/v1/cart/discount',
      as: 'customer:small',
      body: '{"code": "FIXED20"}',
      test: `
        PL.status('PLS-5.6', 200, 'FIXED20 on a €9 cart is accepted');
        PL.ac('PLS-5.6', 'the total is never negative', () => {
          const t = PL.json().totals;
          pm.expect(t.totalCents).to.be.at.least(0);
          pm.expect(t.totalCents).to.eql(0);
        });`,
    }),
    request({
      name: 'Dropping below a minimum spend removes the code',
      method: 'PATCH',
      path: '/api/v1/cart/items/{{sliotarId}}',
      as: 'customer:min',
      body: '{"quantity": 2}',
      pre: `
        await PL.call('POST', '/test/seed', { body: { fixtures: ['min-spend-discount'] } });
        pm.environment.set('sliotarId', PL.product('SP-003').id);
        await PL.addToCart('customer:min', 'SP-003', 6);
        PL.set('applied', (await PL.call('POST', '/api/v1/cart/discount', { as: 'customer:min', body: { code: 'MIN50' } })).code);`,
      test: `
        PL.ac('PLS-5.5', 'MIN50 applied while the cart was over €50', () => pm.expect(PL.get('applied')).to.eql(200));
        PL.status('PLS-5.5', 200, 'reducing the quantity returns 200');
        PL.ac('PLS-5.5', 'the code is removed, with a notice, and the discount is gone', () => {
          pm.expect(PL.json().discount).to.be.null;
          pm.expect(PL.json().totals.discountCents).to.eql(0);
          pm.expect(PL.json().notices.map((n) => n.code)).to.include('DISCOUNT_REMOVED');
        });`,
    }),
    request({
      name: 'A single-use code works once',
      method: 'POST',
      path: '/api/v1/cart/discount',
      as: 'customer:second',
      body: '{"code": "ONCE15"}',
      pre: `
        await PL.call('POST', '/test/seed', { body: { fixtures: ['single-use-discount'] } });
        await PL.addToCart('customer:first', 'SP-003', 2);
        await PL.call('POST', '/api/v1/cart/discount', { as: 'customer:first', body: { code: 'ONCE15' } });
        const first = await PL.placeOrder('customer:first');
        PL.set('firstOrder', first.json().data);
        await PL.addToCart('customer:second', 'SP-003', 2);`,
      test: `
        PL.ac('PLS-5.3', 'the first customer got 15% off', () => pm.expect(PL.get('firstOrder').discount.code).to.eql('ONCE15'));
        PL.status('PLS-5.3', 422, 'the second customer is refused with 422');
        PL.errorCode('PLS-5.3', 'DISCOUNT_ALREADY_USED');
        await PL.call('PATCH', '/api/v1/orders/' + PL.get('firstOrder').id + '/status', { as: 'admin', headers: { 'If-Match': '*' }, body: { status: 'cancelled' } });`,
    }),
    request({
      name: 'Two orders using a single-use code at the same moment',
      path: '/api/v1/orders',
      as: 'customer:third',
      pre: `
        await PL.call('POST', '/test/seed', { body: { fixtures: ['single-use-discount'] } });
        for (const who of ['customer:third', 'customer:fourth']) {
          await PL.addToCart(who, 'SP-003', 2);
          await PL.call('POST', '/api/v1/cart/discount', { as: who, body: { code: 'ONCE15' } });
        }
        const both = await Promise.all([PL.placeOrder('customer:third'), PL.placeOrder('customer:fourth')]);
        PL.set('raced', both.filter((r) => r.code === 201).map((r) => r.json().data));`,
      test: `
        PL.ac('PLS-24.9', 'only one of the two orders got the discount', () => {
          const orders = PL.get('raced');
          pm.expect(orders.length).to.be.above(0);
          pm.expect(orders.filter((o) => o.discount).length).to.eql(1);
        });
        for (const o of PL.get('raced')) await PL.call('PATCH', '/api/v1/orders/' + o.id + '/status', { as: 'admin', headers: { 'If-Match': '*' }, body: { status: 'cancelled' } });`,
    }),
  ]),
]);
