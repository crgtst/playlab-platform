import { collection, folder, request } from '../dsl.mjs';

// One buyer, one other customer and one admin, all made fresh for the run. Everything the run orders is cancelled at the
// end, so the stock of SP-003 is back where it started (and a check proves it).
const SKU = 'SP-003';
const orderPath = (name) => `{{${name}Id}}`;
const order = (name) => `PL.get('${name}')`;
const idOf = (name) => `pm.environment.set('${name}Id', ${order(name)}.id);`;

const patchStatus = ({ name, label, order: key, status, ifMatch, test }) =>
  request({
    name,
    method: 'PATCH',
    path: `/api/v1/orders/${orderPath(key)}/status`,
    as: 'admin',
    headers: ifMatch === undefined ? {} : { 'If-Match': ifMatch },
    body: JSON.stringify({ status }),
    pre: `${idOf(key)}${ifMatch === '{{etag}}' ? `\n        pm.environment.set('etag', (await PL.call('GET', '/api/v1/orders/' + ${order(key)}.id, { as: 'admin' })).headers.get('ETag'));` : ''}`,
    test,
  });

export default collection('06 Orders: checkout, history, access and lifecycle', 'PLS-6, 7, 20 and 21 over the API, from paying with a card to cancelling and restocking.', [
  folder('Checkout (PLS-6)', [
    request({
      name: 'Pay with the success card',
      method: 'POST',
      path: '/api/v1/orders',
      as: 'customer:buyer',
      headers: { 'Idempotency-Key': 'postman-{{runKey}}' },
      body: '{{orderBody}}',
      pre: `
        pm.environment.set('runKey', Date.now().toString(36) + Math.random().toString(16).slice(2, 6));
        PL.set('stockBefore', await PL.stockOf('${SKU}'));
        await PL.addToCart('customer:buyer', '${SKU}', 2);
        PL.set('cartTotals', (await PL.call('GET', '/api/v1/cart', { as: 'customer:buyer' })).json().totals);
        pm.environment.set('orderBody', JSON.stringify(PL.orderBody()));`,
      test: `
        PL.status('PLS-6.1', 201, 'a successful payment returns 201');
        PL.schema('PLS-6.1', 'OrderEnvelope');
        PL.ac('PLS-6.1', 'the order is paid, numbered PL-nnnnnn, and shows the card ending 4242', () => {
          const o = PL.json().data;
          pm.expect(o.status).to.eql('paid');
          pm.expect(o.number).to.match(/^PL-\\d{6}$/);
          pm.expect(o.cardLast4).to.eql('4242');
          pm.expect(pm.response.headers.get('Location')).to.eql('/api/v1/orders/' + o.id);
        });
        PL.ac('PLS-6.7', 'the order total is the cart total the server worked out', () => pm.expect(PL.json().data.totals).to.eql(PL.get('cartTotals')));
        PL.ac('PLS-6.1', 'the cart is emptied', async () => pm.expect((await PL.call('GET', '/api/v1/cart', { as: 'customer:buyer' })).json().itemCount).to.eql(0));
        PL.ac('PLS-20.5', 'the stock went down by the quantity ordered', async () => pm.expect(await PL.stockOf('${SKU}')).to.eql(PL.get('stockBefore') - 2));
        PL.set('order1', PL.json().data);`,
    }),
    request({
      name: 'Send the same order again with the same Idempotency-Key',
      method: 'POST',
      path: '/api/v1/orders',
      as: 'customer:buyer',
      headers: { 'Idempotency-Key': 'postman-{{runKey}}' },
      body: '{{orderBody}}',
      pre: `pm.environment.set('orderBody', JSON.stringify(PL.orderBody()));`,
      test: `
        PL.status('PLS-10.5', 200, 'a replay returns 200, not a second 201');
        PL.ac('PLS-10.5', 'it is the same order, flagged as a replay', () => {
          pm.expect(PL.json().data.id).to.eql(PL.get('order1').id);
          pm.expect(pm.response.headers.get('Idempotent-Replayed')).to.eql('true');
        });
        PL.ac('PLS-10.5', 'no second order was created', async () => pm.expect((await PL.call('GET', '/api/v1/orders', { as: 'customer:buyer' })).json().meta.total).to.eql(1));`,
    }),
    request({
      name: 'Pay with the declined card',
      method: 'POST',
      path: '/api/v1/orders',
      as: 'customer:buyer',
      body: '{{orderBody}}',
      pre: `
        await PL.addToCart('customer:buyer', '${SKU}', 1);
        pm.environment.set('orderBody', JSON.stringify(PL.orderBody({ card: PL.shared().cards.decline.number })));`,
      test: `
        PL.status('PLS-6.2', 402, 'a declined card returns 402');
        PL.errorCode('PLS-6.2', 'PAYMENT_DECLINED');
        PL.schema('PLS-6.2', 'Error');
        PL.ac('PLS-6.2', 'no order is created and the cart is kept', async () => {
          pm.expect((await PL.call('GET', '/api/v1/orders', { as: 'customer:buyer' })).json().meta.total).to.eql(1);
          pm.expect((await PL.call('GET', '/api/v1/cart', { as: 'customer:buyer' })).json().itemCount).to.eql(1);
        });`,
    }),
    request({
      name: 'Pay with a card number that fails the check digit',
      method: 'POST',
      path: '/api/v1/orders',
      as: 'customer:buyer',
      body: '{{orderBody}}',
      pre: `pm.environment.set('orderBody', JSON.stringify(PL.orderBody({ card: PL.shared().cards.invalid.number })));`,
      test: `
        PL.status('PLS-6.2', 422, 'an invalid card number returns 422');
        PL.ac('PLS-6.2', 'the error is on payment.cardNumber', () => pm.expect(PL.json().error.details.map((d) => d.field)).to.include('payment.cardNumber'));`,
    }),
    request({
      name: 'Pay with the timeout card',
      method: 'POST',
      path: '/api/v1/orders',
      as: 'customer:buyer',
      body: '{{orderBody}}',
      budgetMs: 10000,
      pre: `pm.environment.set('orderBody', JSON.stringify(PL.orderBody({ card: PL.shared().cards.timeout.number })));`,
      test: `
        PL.status('PLS-6.3', 504, 'a provider that does not answer returns 504');
        PL.errorCode('PLS-6.3', 'PAYMENT_TIMEOUT');`,
    }),
    request({
      name: 'A total sent by the client is ignored',
      method: 'POST',
      path: '/api/v1/orders',
      as: 'customer:buyer',
      body: '{{orderBody}}',
      pre: `
        PL.set('cartTotals', (await PL.call('GET', '/api/v1/cart', { as: 'customer:buyer' })).json().totals);
        pm.environment.set('orderBody', JSON.stringify(PL.orderBody({ extra: { totals: { totalCents: 1 }, items: [{ productId: PL.product('${SKU}').id, unitPriceCents: 1 }] } })));`,
      test: `
        PL.status('PLS-6.7', 201, 'the order is placed');
        PL.ac('PLS-6.7', 'the total is the server’s, not the 1 cent the client sent', () => {
          pm.expect(PL.json().data.totals.totalCents).to.not.eql(1);
          pm.expect(PL.json().data.totals).to.eql(PL.get('cartTotals'));
        });
        PL.set('order2', PL.json().data);`,
    }),
  ]),
  folder('History and access (PLS-7)', [
    request({
      name: 'The buyer’s order history',
      path: '/api/v1/orders',
      as: 'customer:buyer',
      test: `
        PL.status('PLS-7.1', 200, 'the history is returned');
        PL.schema('PLS-7.1', 'OrderList');
        PL.ac('PLS-7.1', 'it holds both orders, newest first', () => {
          const ids = PL.json().data.map((o) => o.id);
          pm.expect(ids).to.eql([PL.get('order2').id, PL.get('order1').id]);
        });`,
    }),
    request({
      name: 'Another customer sees no orders',
      path: '/api/v1/orders',
      as: 'customer:other',
      test: `
        PL.status('PLS-7.1', 200, 'the list is returned');
        PL.ac('PLS-7.1', 'it is empty', () => pm.expect(PL.json().meta.total).to.eql(0));`,
    }),
    request({
      name: 'Another customer cannot read the order',
      path: '/api/v1/orders/{{order1Id}}',
      as: 'customer:other',
      pre: idOf('order1'),
      test: `
        PL.status('PLS-7.2', 404, 'another customer’s order is a 404, not a 403');
        PL.schema('PLS-7.2', 'Error');
        PL.ac('PLS-24.1', 'and it cannot be tracked or cancelled either', async () => {
          pm.expect((await PL.call('GET', '/api/v1/orders/' + PL.get('order1').id + '/tracking', { as: 'customer:other' })).code).to.eql(404);
          pm.expect((await PL.call('POST', '/api/v1/orders/' + PL.get('order1').id + '/cancel', { as: 'customer:other' })).code).to.eql(404);
        });`,
    }),
    request({
      name: 'The owner reads the order',
      path: '/api/v1/orders/{{order1Id}}',
      as: 'customer:buyer',
      pre: idOf('order1'),
      test: `
        PL.status('PLS-7.1', 200, 'the owner can read it');
        PL.schema('PLS-7.1', 'OrderEnvelope');
        PL.ac('PLS-21.6', 'it has an ETag', () => pm.expect(pm.response.headers.get('ETag')).to.be.a('string').and.not.empty);`,
    }),
    request({
      name: 'Track the parcel',
      path: '/api/v1/orders/{{order1Id}}/tracking',
      as: 'customer:buyer',
      pre: idOf('order1'),
      test: `
        PL.status('PLS-7.1', 200, 'tracking is returned');
        PL.schema('PLS-7.1', 'Tracking', PL.json().data);
        PL.ac('PLS-7.1', 'the first event is the order being placed', () => pm.expect(PL.json().data.events[0].status).to.eql('placed'));`,
    }),
  ]),
  folder('Lifecycle and locking (PLS-20, PLS-21)', [
    patchStatus({
      name: 'Change the status with a stale ETag',
      order: 'order1',
      status: 'processing',
      ifMatch: '"stale"',
      test: `
        PL.status('PLS-21.5', 412, 'a stale ETag returns 412');
        PL.errorCode('PLS-21.5', 'PRECONDITION_FAILED');
        PL.ac('PLS-21.5', 'the status is unchanged', async () => pm.expect((await PL.call('GET', '/api/v1/orders/' + PL.get('order1').id, { as: 'admin' })).json().data.status).to.eql('paid'));`,
    }),
    patchStatus({
      name: 'Change the status with no If-Match',
      order: 'order1',
      status: 'processing',
      test: `
        PL.status('PLS-21.5', 428, 'no If-Match returns 428');
        PL.errorCode('PLS-21.5', 'PRECONDITION_REQUIRED');`,
    }),
    patchStatus({
      name: 'Move the order to processing with its current ETag',
      order: 'order1',
      status: 'processing',
      ifMatch: '{{etag}}',
      test: `
        PL.status('PLS-20.1', 200, 'an allowed move returns 200');
        PL.schema('PLS-20.1', 'OrderEnvelope');
        PL.ac('PLS-21.6', 'the status is processing and the ETag has changed', () => {
          pm.expect(PL.json().data.status).to.eql('processing');
          pm.expect(PL.json().data.etag).to.not.eql(pm.environment.get('etag'));
        });`,
    }),
    patchStatus({
      name: 'Move the order backwards',
      order: 'order1',
      status: 'paid',
      ifMatch: '*',
      test: `
        PL.status('PLS-20.2', 409, 'going back a step returns 409');
        PL.errorCode('PLS-20.2', 'INVALID_TRANSITION');
        PL.ac('PLS-20.2', 'the error says where it was, where it was going and what is allowed', () => pm.expect(PL.json().error.details).to.eql({ from: 'processing', to: 'paid', allowed: ['shipped', 'cancelled'] }));`,
    }),
    request({
      name: 'A customer cannot cancel an order that is processing',
      method: 'POST',
      path: '/api/v1/orders/{{order1Id}}/cancel',
      as: 'customer:buyer',
      pre: idOf('order1'),
      test: `
        PL.status('PLS-20.6', 409, 'cancelling once processing returns 409');
        PL.errorCode('PLS-20.6', 'INVALID_TRANSITION');`,
    }),
    request({
      name: 'A bulk change where one order cannot move changes none',
      method: 'POST',
      path: '/api/v1/orders/bulk-status',
      as: 'admin',
      body: '{{bulkBody}}',
      pre: `pm.environment.set('bulkBody', JSON.stringify({ ids: [PL.get('order1').id, PL.get('order2').id], status: 'shipped' }));`,
      test: `
        PL.status('PLS-20.4', 409, 'a bulk change with an order that cannot move returns 409');
        PL.ac('PLS-20.4', 'it lists the paid order that cannot be shipped', () => {
          const refused = PL.json().error.details.orders;
          pm.expect(refused.map((o) => [o.id, o.from])).to.eql([[PL.get('order2').id, 'paid']]);
        });
        PL.ac('PLS-20.4', 'the order that could have moved did not', async () => pm.expect((await PL.call('GET', '/api/v1/orders/' + PL.get('order1').id, { as: 'admin' })).json().data.status).to.eql('processing'));`,
    }),
    patchStatus({
      name: 'Cancel the processing order as an admin',
      order: 'order1',
      status: 'cancelled',
      ifMatch: '*',
      test: `
        PL.status('PLS-20.5', 200, 'an admin can cancel a processing order');
        PL.ac('PLS-20.5', 'its stock is put back (one order of 1 is still open)', async () => pm.expect(await PL.stockOf('${SKU}')).to.eql(PL.get('stockBefore') - 1));`,
    }),
    request({
      name: 'A customer cancels their own paid order',
      method: 'POST',
      path: '/api/v1/orders/{{order2Id}}/cancel',
      as: 'customer:buyer',
      pre: idOf('order2'),
      test: `
        PL.status('PLS-20.6', 200, 'a paid order can be cancelled by its customer');
        PL.ac('PLS-20.6', 'its status is cancelled', () => pm.expect(PL.json().data.status).to.eql('cancelled'));
        PL.ac('PLS-20.5', 'every unit is back in stock', async () => pm.expect(await PL.stockOf('${SKU}')).to.eql(PL.get('stockBefore')));`,
    }),
  ]),
  // Last, and cleaned up inside the test, so the stock checks above are not disturbed by an extra order.
  folder('Paying twice (PLS-6.4)', [
    request({
      name: 'Two payments at the same moment create one order',
      path: '/api/v1/orders',
      as: 'customer:double',
      pre: `
        await PL.addToCart('customer:double', '${SKU}', 1);
        const both = await Promise.all([PL.placeOrder('customer:double'), PL.placeOrder('customer:double')]);
        PL.set('doubleStatuses', both.map((r) => r.code).sort());
        PL.set('doubleOrders', both.filter((r) => r.code === 201).map((r) => r.json().data));`,
      test: `
        PL.status('PLS-6.4', 200, 'the history is returned');
        PL.ac('PLS-6.4', 'exactly one of the two payments created an order', () => {
          pm.expect(PL.get('doubleStatuses').filter((code) => code === 201)).to.have.length(1);
          pm.expect(PL.json().meta.total).to.eql(1);
        });
        // Put the stock back.
        for (const o of PL.get('doubleOrders')) await PL.call('PATCH', '/api/v1/orders/' + o.id + '/status', { as: 'admin', headers: { 'If-Match': '*' }, body: { status: 'cancelled' } });`,
    }),
  ]),
]);
