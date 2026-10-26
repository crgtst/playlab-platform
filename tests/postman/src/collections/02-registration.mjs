import { collection, folder, request } from '../dsl.mjs';

const newPerson = (suffix) => `
  const unique = Date.now().toString(36) + Math.random().toString(16).slice(2, 6);
  PL.set('person', { name: 'Casey Registrant', email: 'registrant-' + unique + '@playlab.test', password: 'Password123!' });
  pm.environment.set('registerBody', JSON.stringify(PL.get('person')));${suffix ?? ''}`;

export default collection('02 Registration and password reset', 'PLS-2: registering, the confirmation email, duplicates, validation and resetting a password.', [
  folder('Registration', [
    request({
      name: 'Register a new customer',
      method: 'POST',
      path: '/api/v1/auth/register',
      body: '{{registerBody}}',
      pre: newPerson(),
      test: `
        PL.status('PLS-2.1', 201, 'valid details return 201');
        PL.schema('PLS-2.1', 'UserEnvelope');
        PL.ac('PLS-2.1', 'the new account is an unconfirmed customer', () => {
          pm.expect(PL.json().user.role).to.eql('customer');
          pm.expect(PL.json().user.emailVerified).to.be.false;
          pm.expect(PL.json().user).to.not.have.any.keys('password', 'passwordHash');
        });`,
    }),
    request({
      name: 'The confirmation email is in the test mailbox',
      path: '/test/mailbox/{{personEmail}}',
      pre: `pm.environment.set('personEmail', encodeURIComponent(PL.get('person').email));`,
      test: `
        PL.status('PLS-2.1', 200, 'the mailbox can be read');
        PL.ac('PLS-2.1', 'a confirmation email with a link is waiting', () => {
          const mail = PL.json().data.find((m) => m.type === 'confirm-email');
          pm.expect(mail, 'a confirm-email message').to.exist;
          pm.expect(mail.link).to.include('/confirm-email?token=');
          pm.expect(mail.subject).to.eql('Confirm your PlayLab Shop account');
        });
        PL.set('confirmTokenStored', PL.tokenFrom(PL.json().data.find((m) => m.type === 'confirm-email').link));`,
    }),
    request({
      name: 'Confirm the email address',
      method: 'POST',
      path: '/api/v1/auth/confirm-email',
      body: '{"token": "{{confirmToken}}"}',
      pre: `pm.environment.set('confirmToken', PL.get('confirmTokenStored'));`,
      test: `
        PL.status('PLS-2.1', 200, 'the confirmation link works');
        PL.ac('PLS-2.1', 'the account is now confirmed', () => pm.expect(PL.json().user.emailVerified).to.be.true);`,
    }),
    request({
      name: 'Register the same email again',
      method: 'POST',
      path: '/api/v1/auth/register',
      body: '{{registerBody}}',
      pre: `pm.environment.set('registerBody', JSON.stringify(PL.get('person')));`,
      test: `
        PL.status('PLS-2.2', 409, 'an email already in use returns 409');
        PL.errorCode('PLS-2.2', 'EMAIL_IN_USE');
        PL.ac('PLS-2.2', 'the message is "An account with this email already exists"', () => pm.expect(PL.json().error.message).to.eql('An account with this email already exists'));`,
    }),
    request({
      name: 'Register a name with accents',
      method: 'POST',
      path: '/api/v1/auth/register',
      body: '{{registerBody}}',
      pre: newPerson().replace("name: 'Casey Registrant'", "name: 'Aoife Ní Bhriain'"),
      test: `
        PL.status('PLS-2.3', 201, 'a name with fadas is accepted');
        PL.ac('PLS-2.3', 'the name comes back unchanged', () => pm.expect(PL.json().user.name).to.eql('Aoife Ní Bhriain'));`,
    }),
    request({
      name: 'Register with invalid details',
      method: 'POST',
      path: '/api/v1/auth/register',
      body: '{"name": "", "email": "not-an-email", "password": "short"}',
      test: `
        PL.status('PLS-2.4', 422, 'invalid details return 422, not 500');
        PL.schema('PLS-2.4', 'Error');
        PL.ac('PLS-2.4', 'each invalid field is named with a message', () => {
          const details = PL.json().error.details;
          pm.expect(details.map((d) => d.field)).to.have.members(['name', 'email', 'password']);
          for (const d of details) pm.expect(d.message).to.be.a('string').and.not.empty;
        });`,
    }),
    request({
      name: 'A role in the registration body is ignored',
      method: 'POST',
      path: '/api/v1/auth/register',
      body: '{{registerBody}}',
      pre: newPerson().replace("password: 'Password123!' });", "password: 'Password123!', role: 'admin' });"),
      test: `
        PL.status('PLS-24.4', 201, 'registering with a role field still returns 201');
        PL.ac('PLS-24.4', 'the account is a customer, not an admin', () => pm.expect(PL.json().user.role).to.eql('customer'));`,
    }),
  ]),
  folder('Password reset', [
    request({
      name: 'Ask for a reset link for a registered email',
      method: 'POST',
      path: '/api/v1/auth/forgot-password',
      body: '{{forgotBody}}',
      pre: `
        const u = await PL.user('customer:reset');
        pm.environment.set('forgotBody', JSON.stringify({ email: u.email }));`,
      test: `
        PL.status('PLS-2.5', 202, 'a reset request returns 202');
        PL.ac('PLS-2.5', 'the message does not say whether the account exists', () => pm.expect(PL.json().message).to.eql('If an account exists for that email, a reset link has been sent.'));
        PL.set('knownReset', PL.json());`,
    }),
    request({
      name: 'Ask for a reset link for an unknown email',
      method: 'POST',
      path: '/api/v1/auth/forgot-password',
      body: '{"email": "nobody-at-all@playlab.test"}',
      test: `
        PL.status('PLS-24.3', 202, 'an unknown email gets the same 202');
        PL.ac('PLS-24.3', 'and the identical body, so emails cannot be enumerated', () => pm.expect(PL.json()).to.eql(PL.get('knownReset')));`,
    }),
    request({
      name: 'The reset email is in the test mailbox',
      path: '/test/mailbox/{{resetEmail}}',
      pre: `pm.environment.set('resetEmail', encodeURIComponent((await PL.user('customer:reset')).email));`,
      test: `
        PL.status('PLS-2.5', 200, 'the mailbox can be read');
        PL.ac('PLS-2.5', 'the reset link is a one-hour link', () => {
          const mail = PL.json().data.find((m) => m.type === 'password-reset');
          pm.expect(mail, 'a password-reset message').to.exist;
          pm.expect(mail.link).to.include('/reset-password?token=');
          pm.expect(mail.body).to.include('expires in 1 hour');
        });
        PL.set('resetTokenStored', PL.tokenFrom(PL.json().data.find((m) => m.type === 'password-reset').link));`,
    }),
    request({
      name: 'Choose a new password with the link',
      method: 'POST',
      path: '/api/v1/auth/reset-password',
      body: '{"token": "{{resetToken}}", "password": "NewPassword456!"}',
      pre: `pm.environment.set('resetToken', PL.get('resetTokenStored'));`,
      test: `PL.status('PLS-2.5', 200, 'a valid link accepts a new password');`,
    }),
    request({
      name: 'The new password logs in',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: '{{loginBody}}',
      pre: `pm.environment.set('loginBody', JSON.stringify({ email: (await PL.user('customer:reset')).email, password: 'NewPassword456!' }));`,
      test: `PL.status('PLS-2.5', 200, 'the new password works');`,
    }),
    request({
      name: 'The same link cannot be used twice',
      method: 'POST',
      path: '/api/v1/auth/reset-password',
      body: '{"token": "{{resetToken}}", "password": "AnotherPassword789!"}',
      pre: `pm.environment.set('resetToken', PL.get('resetTokenStored'));`,
      test: `
        PL.ac('PLS-2.5', 'a used link is refused', () => pm.expect(pm.response.code).to.be.oneOf([400, 401, 410, 422]));
        PL.schema('PLS-2.5', 'Error');`,
    }),
  ]),
]);
