import { collection, folder, request } from '../dsl.mjs';

const productBody = (extra = {}) => JSON.stringify({ sku: 'PM-{{runKey}}', name: 'Postman test product', description: 'Made by the Postman collection', category: 'books', priceCents: 1999, stock: 4, ...extra });
const etagOf = `(await PL.call('GET', '/api/v1/products/' + PL.get('made').id)).headers.get('ETag')`;

const patchProduct = ({ name, headers, test, body = '{"name": "Renamed by Postman"}' }) =>
  request({ name, method: 'PATCH', path: '/api/v1/products/{{madeId}}', as: 'admin', headers, body, pre: `pm.environment.set('madeId', PL.get('made').id);${headers?.['If-Match'] === '{{etag}}' ? `\n        pm.environment.set('etag', ${etagOf});` : ''}`, test });

export default collection('07 Admin and accounts: products, users, your own account', 'PLS-8, 21, 22, 23 and 24 over the API: who may do what, and what each change does.', [
  folder('Product management (PLS-8, PLS-21)', [
    request({
      name: 'A customer cannot create a product',
      method: 'POST',
      path: '/api/v1/products',
      as: 'customer',
      body: productBody(),
      pre: `pm.environment.set('runKey', Date.now().toString(36));`,
      test: `
        PL.status('PLS-8.5', 403, 'a customer is refused with 403');
        PL.schema('PLS-8.5', 'Error');`,
    }),
    request({
      name: 'Support cannot create a product',
      method: 'POST',
      path: '/api/v1/products',
      as: 'support',
      body: productBody(),
      test: `PL.status('PLS-8.5', 403, 'support is read-only: 403');`,
    }),
    request({
      name: 'An admin creates a product',
      method: 'POST',
      path: '/api/v1/products',
      as: 'admin',
      body: productBody(),
      test: `
        PL.status('PLS-8.4', 201, 'an admin can create a product');
        PL.schema('PLS-8.4', 'ProductEnvelope');
        PL.ac('PLS-8.4', 'it has a Location and shows in the catalogue', async () => {
          const made = PL.json().data;
          pm.expect(pm.response.headers.get('Location')).to.eql('/api/v1/products/' + made.id);
          const found = (await PL.call('GET', '/api/v1/products?q=Postman%20test%20product')).json();
          pm.expect(found.data.map((p) => p.id)).to.include(made.id);
        });
        PL.set('made', PL.json().data);`,
    }),
    patchProduct({
      name: 'Edit with a stale ETag',
      headers: { 'If-Match': '"stale"' },
      test: `
        PL.status('PLS-21.2', 412, 'a stale ETag returns 412');
        PL.errorCode('PLS-21.2', 'PRECONDITION_FAILED');`,
    }),
    patchProduct({
      name: 'Edit with no If-Match',
      test: `
        PL.status('PLS-21.3', 428, 'no If-Match returns 428');
        PL.errorCode('PLS-21.3', 'PRECONDITION_REQUIRED');`,
    }),
    patchProduct({
      name: 'Edit with the current ETag',
      headers: { 'If-Match': '{{etag}}' },
      test: `
        PL.status('PLS-21.1', 200, 'the current ETag is accepted');
        PL.ac('PLS-21.1', 'the change is saved and the ETag is new', () => {
          pm.expect(PL.json().data.name).to.eql('Renamed by Postman');
          pm.expect(pm.response.headers.get('ETag')).to.not.eql(pm.environment.get('etag'));
        });`,
    }),
    request({
      name: 'Delete the product',
      method: 'DELETE',
      path: '/api/v1/products/{{madeId}}',
      as: 'admin',
      pre: `pm.environment.set('madeId', PL.get('made').id);`,
      test: `
        PL.status('PLS-8.4', 204, 'deleting returns 204');
        PL.ac('PLS-8.4', 'the product is gone', async () => pm.expect((await PL.call('GET', '/api/v1/products/' + PL.get('made').id)).code).to.eql(404));`,
    }),
    request({
      name: 'Export the orders as CSV',
      path: '/api/v1/orders/export.csv',
      as: 'admin',
      test: `
        PL.status('PLS-9.4', 200, 'an admin can export');
        PL.ac('PLS-9.4', 'it is a CSV with the header row first', () => {
          pm.expect(pm.response.headers.get('Content-Type')).to.include('text/csv');
          pm.expect(pm.response.text().split('\\r\\n')[0]).to.eql('number,created_at,customer_email,status,items,subtotal,discount_code,discount,vat,delivery,total,currency');
        });`,
    }),
    request({
      name: 'A customer cannot export',
      path: '/api/v1/orders/export.csv',
      as: 'customer',
      test: `PL.status('PLS-8.5', 403, 'a customer is refused with 403');`,
    }),
  ]),
  folder('Avatar uploads (PLS-9)', [
    request({
      name: 'A text file renamed to .png is refused',
      method: 'POST',
      path: '/api/v1/users/me/avatar',
      as: 'customer:files',
      headers: { 'Content-Type': 'multipart/form-data; boundary=postman-boundary' },
      body: '{{multipart}}',
      pre: `pm.environment.set('multipart', PL.multipart('fake.png', 'image/png', 'this is not an image'));`,
      test: `
        PL.status('PLS-9.3', 415, 'a file that is not an image returns 415');
        PL.errorCode('PLS-9.3', 'UNSUPPORTED_MEDIA_TYPE');
        PL.ac('PLS-9.3', 'the message says only PNG or JPG are allowed', () => pm.expect(PL.json().error.message).to.eql('Only PNG or JPG images are allowed'));`,
    }),
    request({
      name: 'A file over 2 MB is refused',
      method: 'POST',
      path: '/api/v1/users/me/avatar',
      as: 'customer:files',
      headers: { 'Content-Type': 'multipart/form-data; boundary=postman-boundary' },
      body: '{{multipart}}',
      budgetMs: 10000,
      pre: `pm.environment.set('multipart', PL.multipart('huge.png', 'image/png', 'a'.repeat(2 * 1024 * 1024 + 1)));`,
      test: `
        PL.status('PLS-9.2', 413, 'a file over 2 MB returns 413');
        PL.ac('PLS-9.2', 'the message is "File too large"', () => pm.expect(PL.json().error.message).to.eql('File too large'));`,
    }),
  ]),
  folder('Your own account (PLS-22)', [
    request({
      name: 'Change your name',
      method: 'PATCH',
      path: '/api/v1/users/me',
      as: 'customer:acct',
      body: '{"name": "Casey Renamed"}',
      test: `
        PL.status('PLS-22.1', 200, 'a name change returns 200');
        PL.ac('PLS-22.1', 'GET /users/me shows the new name', async () => pm.expect((await PL.call('GET', '/api/v1/users/me', { as: 'customer:acct' })).json().data.name).to.eql('Casey Renamed'));`,
    }),
    request({
      name: 'Change your email with the wrong password',
      method: 'PATCH',
      path: '/api/v1/users/me',
      as: 'customer:acct',
      body: '{"email": "new-address-{{runKey}}@playlab.test", "currentPassword": "not-the-password"}',
      test: `
        PL.status('PLS-22.3', 422, 'a wrong password returns 422');
        PL.ac('PLS-22.3', 'the error is on currentPassword', () => pm.expect(PL.json().error.details.map((d) => d.field)).to.eql(['currentPassword']));`,
    }),
    request({
      name: 'Change your email to one that belongs to someone else',
      method: 'PATCH',
      path: '/api/v1/users/me',
      as: 'customer:acct',
      body: '{{emailBody}}',
      pre: `pm.environment.set('emailBody', JSON.stringify({ email: (await PL.user('customer')).email, currentPassword: (await PL.user('customer:acct')).password }));`,
      test: `
        PL.status('PLS-22.6', 409, 'an email in use returns 409');
        PL.errorCode('PLS-22.6', 'EMAIL_IN_USE');`,
    }),
    request({
      name: 'Change your email with the right password',
      method: 'PATCH',
      path: '/api/v1/users/me',
      as: 'customer:acct',
      body: '{{emailBody}}',
      pre: `
        PL.set('newEmail', 'new-address-' + pm.environment.get('runKey') + '@playlab.test');
        pm.environment.set('emailBody', JSON.stringify({ email: PL.get('newEmail'), currentPassword: (await PL.user('customer:acct')).password }));`,
      test: `
        PL.status('PLS-22.2', 200, 'the email is changed');
        PL.ac('PLS-22.2', 'the new email logs in and the old one does not', async () => {
          const acct = PL.get('user.customer:acct');
          pm.expect((await PL.call('POST', '/api/v1/auth/login', { body: { email: PL.get('newEmail'), password: acct.password } })).code).to.eql(200);
          pm.expect((await PL.call('POST', '/api/v1/auth/login', { body: { email: acct.email, password: acct.password } })).code).to.eql(401);
        });`,
    }),
    request({
      name: 'Delete your account',
      method: 'DELETE',
      path: '/api/v1/users/me',
      as: 'customer:acct',
      test: `
        PL.status('PLS-22.4', 204, 'deleting your account returns 204');
        PL.ac('PLS-22.4', 'the access token stops working at once', async () => {
          const me = await PL.call('GET', '/api/v1/users/me', { as: 'customer:acct' });
          pm.expect(me.code).to.eql(401);
          pm.expect(me.json().error.code).to.eql('TOKEN_REVOKED');
        });`,
    }),
  ]),
  folder('User administration (PLS-23, PLS-24.8)', [
    request({
      name: 'An admin lists users by role and name',
      path: '/api/v1/admin/users?role=support&q={{supportName}}',
      as: 'admin',
      pre: `
        const support = await PL.user('support');
        pm.environment.set('supportName', encodeURIComponent(support.email));`,
      test: `
        PL.status('PLS-23.1', 200, 'the list is returned');
        PL.ac('PLS-23.1', 'only the matching support user is in it, as an AdminUser', () => {
          const data = PL.json().data;
          pm.expect(data).to.have.length(1);
          pm.expect(data[0].role).to.eql('support');
          PL.matches('AdminUser', data[0]);
          pm.expect(JSON.stringify(data)).to.not.match(/password|\\$2[aby]\\$/i);
        });
        PL.ac('PLS-23.1', 'the page details and the total count header agree', () => {
          pm.expect(PL.json().meta.total).to.eql(1);
          pm.expect(pm.response.headers.get('X-Total-Count')).to.eql('1');
        });`,
    }),
    request({
      name: 'Support can list users',
      path: '/api/v1/admin/users?limit=1',
      as: 'support',
      test: `PL.status('PLS-23.4', 200, 'support can read the list');`,
    }),
    request({
      name: 'Support cannot change a user',
      method: 'PATCH',
      path: '/api/v1/admin/users/{{targetId}}',
      as: 'support',
      body: '{"role": "admin"}',
      pre: `pm.environment.set('targetId', (await PL.user('customer')).id);`,
      test: `PL.status('PLS-23.4', 403, 'support is refused with 403');`,
    }),
    request({
      name: 'A customer cannot list users',
      path: '/api/v1/admin/users',
      as: 'customer',
      test: `
        PL.status('PLS-23.5', 403, 'a customer is refused with 403');
        PL.schema('PLS-23.5', 'Error');`,
    }),
    request({
      name: 'A customer cannot change a user',
      method: 'PATCH',
      path: '/api/v1/admin/users/{{targetId}}',
      as: 'customer',
      body: '{"role": "admin"}',
      test: `
        PL.status('PLS-24.8', 403, 'a customer is refused with 403');
        PL.ac('PLS-24.8', 'the user is still a customer', async () => pm.expect((await PL.call('GET', '/api/v1/admin/users?q=' + encodeURIComponent((await PL.user('customer')).email), { as: 'admin' })).json().data[0].role).to.eql('customer'));`,
    }),
    request({
      name: 'An admin changes a role, which applies from the next login',
      method: 'PATCH',
      path: '/api/v1/admin/users/{{promoteId}}',
      as: 'admin',
      body: '{"role": "support"}',
      pre: `
        const user = await PL.user('customer:promote');
        pm.environment.set('promoteId', user.id);`,
      test: `
        PL.status('PLS-23.2', 200, 'the change is saved');
        PL.ac('PLS-23.2', 'the token already issued keeps the old role', async () => pm.expect((await PL.call('GET', '/api/v1/admin/users', { as: 'customer:promote' })).code).to.eql(403));
        PL.ac('PLS-23.2', 'a new login gets the new role', async () => {
          const u = PL.get('user.customer:promote');
          const login = await PL.call('POST', '/api/v1/auth/login', { body: { email: u.email, password: u.password } });
          pm.expect(login.code).to.eql(200);
          const list = await PL.send({ url: PL.base + '/api/v1/admin/users?limit=1', header: { 'X-Test-Session': pm.environment.get('session'), Authorization: 'Bearer ' + login.json().accessToken } });
          pm.expect(list.code).to.eql(200);
        });`,
    }),
    request({
      name: 'An admin unlocks a locked account',
      method: 'PATCH',
      path: '/api/v1/admin/users/{{lockedId}}',
      as: 'admin',
      body: '{"unlock": true}',
      pre: `
        const user = await PL.user('customer:locked');
        pm.environment.set('lockedId', user.id);
        for (let i = 0; i < 5; i++) await PL.call('POST', '/api/v1/auth/login', { body: { email: user.email, password: 'wrong-password' } });
        PL.set('wasLocked', (await PL.call('POST', '/api/v1/auth/login', { body: { email: user.email, password: user.password } })).code);`,
      test: `
        PL.status('PLS-23.3', 200, 'the unlock is accepted');
        PL.ac('PLS-23.3', 'the account was locked (423) and the user can log in straight after', async () => {
          const u = PL.get('user.customer:locked');
          pm.expect(PL.get('wasLocked')).to.eql(423);
          pm.expect((await PL.call('POST', '/api/v1/auth/login', { body: { email: u.email, password: u.password } })).code).to.eql(200);
        });`,
    }),
  ]),
]);
