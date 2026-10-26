import { collection, request } from '../dsl.mjs';

// One iteration per row of data/03-registration-data.csv (run.mjs passes the file to Newman).
export default collection(
  '03 Registration: 50 boundary inputs',
  'Data-driven. Each row of data/03-registration-data.csv is one registration attempt with its expected result.',
  [
    request({
      name: 'Register with the row’s values',
      method: 'POST',
      path: '/api/v1/auth/register',
      body: '{{registerBody}}',
      pre: `
        const unique = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
        const omit = pm.iterationData.get('omit');
        const text = (key) => pm.iterationData.get(key).split('<SP>').join(' ');
        const sent = { name: text('name'), email: text('email').replace('UNIQUE8X', unique), password: text('password') };
        if (omit) delete sent[omit];
        PL.set('sent', sent);
        pm.environment.set('registerBody', JSON.stringify(sent));`,
      test: `
        const note = pm.iterationData.get('note');
        const expected = Number(pm.iterationData.get('expectedStatus'));
        const field = pm.iterationData.get('expectedField');
        const sent = PL.get('sent');
        PL.ac('PLS-2.4', note + ': returns ' + expected, () => pm.response.to.have.status(expected));
        if (expected === 201) {
          PL.schema('PLS-2.1', 'UserEnvelope');
          PL.ac('PLS-2.1', note + ': the account is a customer, not yet confirmed', () => {
            pm.expect(PL.json().user.role).to.eql('customer');
            pm.expect(PL.json().user.emailVerified).to.be.false;
          });
          PL.ac('PLS-2.3', note + ': the name and email come back trimmed, and the email lower-cased', () => {
            pm.expect(PL.json().user.name).to.eql(sent.name.trim());
            pm.expect(PL.json().user.email).to.eql(sent.email.trim().toLowerCase());
          });
        } else {
          PL.schema('PLS-10.1', 'Error');
          PL.ac('PLS-2.4', note + ': the error names the ' + field + ' field', () => {
            pm.expect(PL.json().error.code).to.eql('VALIDATION_ERROR');
            pm.expect(PL.json().error.details.map((d) => d.field)).to.include(field);
          });
        }`,
    }),
  ],
);
