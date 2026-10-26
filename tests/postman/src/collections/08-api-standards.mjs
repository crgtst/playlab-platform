import { collection, folder, request } from '../dsl.mjs';

// PLS-10.4: a GET for each readable endpoint, with its response checked against the shared schema. `check` is the
// body of a function of `body` (the parsed response) that validates it.
const reads = [
  { name: 'Health', path: '/api/v1/health', check: `PL.matches('Health', body);` },
  { name: 'Categories', path: '/api/v1/categories', check: `body.data.forEach((c) => PL.matches('CategoryWithCount', c));` },
  { name: 'Products', path: '/api/v1/products?limit=3', check: `PL.matches('ProductList', body);` },
  { name: 'One product', path: '/api/v1/products/{{productId}}', pre: `pm.environment.set('productId', PL.product('EL-001').id);`, check: `PL.matches('ProductEnvelope', body);` },
  { name: 'Reviews', path: '/api/v1/products/{{productId}}/reviews', pre: `pm.environment.set('productId', PL.product('EL-001').id);`, check: `PL.matches('ReviewList', body);` },
  { name: 'Stores', path: '/api/v1/stores', check: `body.data.forEach((s) => PL.matches('Store', s));` },
  { name: 'Nearest stores', path: '/api/v1/stores/nearest?lat=53.2724&lng=-9.0532', check: `body.data.forEach((s) => PL.matches('Store', s)); pm.expect(body.data).to.have.length(3);`, extra: `
        PL.ac('PLS-13.1', 'the 3 nearest stores to Galway are Galway, Limerick and Athlone, nearest first', () => {
          pm.expect(PL.json().data.map((s) => s.id)).to.eql(['galway', 'limerick', 'athlone']);
          const km = PL.json().data.map((s) => s.distanceKm);
          pm.expect(km).to.eql([...km].sort((a, b) => a - b));
        });` },
  { name: 'Address suggestions', path: '/api/v1/addresses/suggest?q=Main', check: `body.data.forEach((a) => PL.matches('AddressSuggestion', a));` },
  { name: 'Offers', path: '/api/v1/offers', check: `pm.expect(body.data.map((o) => o.code)).to.include.members(['SAVE10', 'FIXED20']);` },
  { name: 'Cart', path: '/api/v1/cart', as: 'customer', check: `PL.matches('Cart', body);` },
  { name: 'Wishlist', path: '/api/v1/wishlist', as: 'customer', check: `PL.matches('Wishlist', body);` },
  { name: 'Orders', path: '/api/v1/orders', as: 'customer', check: `PL.matches('OrderList', body);` },
  { name: 'Session user', path: '/api/v1/auth/me', as: 'customer', check: `PL.matches('UserEnvelope', body);` },
  { name: 'Your account', path: '/api/v1/users/me', as: 'customer', check: `PL.matches('User', body.data);` },
  { name: 'User list', path: '/api/v1/admin/users?limit=3', as: 'admin', check: `body.data.forEach((u) => PL.matches('AdminUser', u));` },
  { name: 'Test clock', path: '/test/clock', check: `PL.matches('ClockState', body);` },
];

const error = (name, ac, path, expected, extra = {}) =>
  request({
    name,
    ...extra,
    path,
    test: `
      PL.status('${ac}', ${expected}, 'returns ${expected}');
      PL.schema('${ac}', 'Error');
      PL.ac('${ac}', 'the body has exactly code, message, details and correlationId', () => pm.expect(Object.keys(PL.json().error)).to.eql(['code', 'message', 'details', 'correlationId']));
      PL.ac('PLS-25.1', 'the correlationId in the body is the X-Correlation-Id header', () => pm.expect(PL.json().error.correlationId).to.eql(pm.response.headers.get('X-Correlation-Id')));`,
  });

export default collection('08 API standards: errors, schemas, limits, caching', 'PLS-10 over the API: one error envelope, every readable response matching its schema, the rate limit and conditional requests.', [
  folder('One error shape (PLS-10.1)', [
    error('Unknown route', 'PLS-10.1', '/api/v1/no-such-route', 404),
    error('Unknown product', 'PLS-10.1', '/api/v1/products/999999', 404),
    error('No token', 'PLS-10.1', '/api/v1/orders', 401),
    error('Wrong role', 'PLS-10.1', '/api/v1/admin/users', 403, { as: 'customer' }),
    error('Bad query', 'PLS-10.1', '/api/v1/products?limit=0', 422),
    request({
      name: 'A correlation ID sent by the client is echoed back',
      path: '/api/v1/categories',
      headers: { 'X-Correlation-Id': 'postman-trace-1' },
      test: `
        PL.ac('PLS-25.1', 'the same ID comes back in the header', () => pm.expect(pm.response.headers.get('X-Correlation-Id')).to.eql('postman-trace-1'));`,
    }),
    request({
      name: 'An invalid correlation ID is replaced by a UUID',
      path: '/api/v1/categories',
      headers: { 'X-Correlation-Id': 'not valid!' },
      test: `
        PL.ac('PLS-25.1', 'a new UUID comes back', () => pm.expect(pm.response.headers.get('X-Correlation-Id')).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/));`,
    }),
    request({
      name: 'Invalid JSON is a 400, not a 500',
      method: 'POST',
      path: '/api/v1/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": ',
      test: `
        PL.ac('PLS-10.2', 'bad JSON returns a 4xx', () => pm.expect(pm.response.code).to.be.within(400, 422));
        PL.schema('PLS-10.2', 'Error');`,
    }),
  ]),
  folder('Every readable response matches its schema (PLS-10.4)', reads.map((r) =>
    request({
      name: `GET ${r.name}`,
      path: r.path,
      as: r.as,
      pre: r.pre ?? '',
      test: `
        PL.status('PLS-10.4', 200, 'returns 200');
        PL.ac('PLS-10.4', 'the response is JSON', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'));
        PL.ac('PLS-10.4', '${r.name} matches its schema', () => {
          const body = PL.json();
          ${r.check}
        });${r.extra ?? ''}`,
    }),
  )),
  folder('Limits and caching', [
    request({
      name: 'A shopper who uses up the rate limit gets 429',
      path: '/api/v1/categories',
      pre: `
        // A session of its own, because the limit is counted per session and the other requests share one.
        const fresh = await PL.newSession();
        pm.environment.set('freshSession', fresh);
        pm.request.headers.upsert({ key: 'X-Test-Session', value: fresh });
        if (PL.rateLimited()) {
          const limit = Number(pm.environment.get('rateLimitPerMin'));
          const statuses = [];
          for (let i = 0; i < limit; i++) statuses.push((await PL.send({ url: PL.base + '/api/v1/categories', header: { 'X-Test-Session': fresh } })).code);
          PL.set('beforeLimit', statuses);
        }`,
      test: `
        if (!PL.rateLimited()) {
          pm.test.skip('PLS-10.3 the rate limit is off in this environment');
          return;
        }
        PL.ac('PLS-10.3', 'the first requests up to the limit all succeed', () => pm.expect(PL.get('beforeLimit').every((code) => code === 200)).to.be.true);
        PL.status('PLS-10.3', 429, 'the next request returns 429');
        PL.errorCode('PLS-10.3', 'RATE_LIMITED');
        PL.ac('PLS-10.3', 'Retry-After says when to try again', () => pm.expect(Number(pm.response.headers.get('Retry-After'))).to.be.within(1, 60));`,
    }),
    request({
      name: 'Changing X-Forwarded-For does not get a fresh rate limit',
      path: '/api/v1/categories',
      headers: { 'X-Forwarded-For': '203.0.113.99' },
      pre: `
        // Use up the limit in a session of its own, then ask again as a different "address".
        const fresh = await PL.newSession();
        pm.request.headers.upsert({ key: 'X-Test-Session', value: fresh });
        if (PL.rateLimited()) {
          for (let i = 0; i < Number(pm.environment.get('rateLimitPerMin')); i++) {
            await PL.send({ url: PL.base + '/api/v1/categories', header: { 'X-Test-Session': fresh, 'X-Forwarded-For': '198.51.100.' + (i % 250) } });
          }
        }`,
      test: `
        if (!PL.rateLimited()) {
          pm.test.skip('PLS-24.6 the rate limit is off in this environment');
          return;
        }
        PL.status('PLS-24.6', 429, 'a new X-Forwarded-For still gets 429');
        PL.errorCode('PLS-24.6', 'RATE_LIMITED');`,
    }),
    request({
      name: 'A product with an ETag',
      path: '/api/v1/products/{{productId}}',
      pre: `pm.environment.set('productId', PL.product('EL-001').id);`,
      test: `
        PL.status('PLS-10.6', 200, 'returns 200');
        PL.set('productEtag', pm.response.headers.get('ETag'));
        PL.ac('PLS-10.6', 'it has an ETag', () => pm.expect(pm.response.headers.get('ETag')).to.be.a('string').and.not.empty);`,
    }),
    request({
      name: 'The same product with If-None-Match',
      path: '/api/v1/products/{{productId}}',
      headers: { 'If-None-Match': '{{productEtag}}' },
      pre: `
        pm.environment.set('productId', PL.product('EL-001').id);
        pm.environment.set('productEtag', PL.get('productEtag'));`,
      test: `
        PL.status('PLS-10.6', 304, 'an unchanged product returns 304');
        PL.ac('PLS-10.6', 'with no body', () => pm.expect(pm.response.text()).to.eql(''));`,
    }),
  ]),
]);
