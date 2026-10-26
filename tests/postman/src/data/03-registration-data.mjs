// 50 boundary inputs for POST /auth/register. `UNIQUE8X` in an email is replaced by 8 random hex characters on every
// run, so the same file can be run again. `<SP>` is a space (the CSV reader trims real ones at the ends). `omit` leaves that field out of the request body altogether.
// expectedStatus is 201 or 422; expectedField is the field the 422 must complain about.
const good = 'Password123!';
const email = 'UNIQUE8X@example.com';
const row = (note, fields) => ({ note, name: 'Casey Tester', email, password: good, omit: '', expectedStatus: 201, expectedField: '', ...fields });
const bad = (note, expectedField, fields) => row(note, { ...fields, expectedStatus: 422, expectedField });
const pad = (n, ch = 'a') => ch.repeat(n);
// An address of exactly `total` characters, ending @x.ie, with the 8-character token in the local part.
const emailOfLength = (total) => `${pad(total - '@x.ie'.length - 8)}UNIQUE8X@x.ie`;

export default {
  columns: ['note', 'name', 'email', 'password', 'omit', 'expectedStatus', 'expectedField'],
  rows: [
    // Names
    row('name: 1 character', { name: 'A' }),
    row('name: 2 characters', { name: 'Al' }),
    row('name: 499 characters', { name: pad(499) }),
    row('name: 500 characters', { name: pad(500) }),
    bad('name: 501 characters', 'name', { name: pad(501) }),
    bad('name: empty', 'name', { name: '' }),
    bad('name: only spaces', 'name', { name: '<SP><SP><SP><SP><SP>' }),
    bad('name: left out', 'name', { omit: 'name' }),
    row('name: padded with spaces is trimmed', { name: '<SP><SP><SP>Padded Name<SP><SP><SP>' }),
    row('name: fadas (PLS-2.3)', { name: 'Seán Ó Briain' }),
    row('name: double-barrelled with a fada (PLS-2.3)', { name: 'Aoife Ní Bhriain-Ó Súilleabháin' }),
    row('name: apostrophe and full stop', { name: "D'Arcy O'Neill Jr." }),
    row('name: emoji', { name: 'Zoë 😀 Ó' }),
    row('name: Arabic (right to left)', { name: 'محمد علي' }),
    row('name: Japanese', { name: '山田 太郎' }),
    row('name: a script tag is stored as text', { name: '<script>alert(1)</script>' }),
    row('name: quotes and a comma', { name: 'Smith, "Jo" J.' }),
    // Emails
    row('email: lower case', { email: 'lower-UNIQUE8X@example.com' }),
    row('email: upper case is lower-cased', { email: 'UPPER-UNIQUE8X@EXAMPLE.COM' }),
    row('email: padded with spaces is trimmed', { email: '<SP><SP>padded-UNIQUE8X@example.com<SP><SP>' }),
    row('email: plus tag', { email: 'jo+shop-UNIQUE8X@example.com' }),
    row('email: subdomain', { email: 'UNIQUE8X@mail.dept.example.com' }),
    row('email: two-letter top-level domain', { email: 'UNIQUE8X@example.ie' }),
    row('email: digits and hyphens', { email: '123-UNIQUE8X@my-company.com' }),
    row('email: 254 characters', { email: emailOfLength(254) }),
    bad('email: 255 characters', 'email', { email: emailOfLength(255) }),
    bad('email: empty', 'email', { email: '' }),
    bad('email: left out', 'email', { omit: 'email' }),
    bad('email: no @', 'email', { email: 'no-at-sign-example.com' }),
    bad('email: two @', 'email', { email: 'two@@example.com' }),
    bad('email: nothing before the @', 'email', { email: '@example.com' }),
    bad('email: nothing after the @', 'email', { email: 'user@' }),
    bad('email: domain starts with a dot', 'email', { email: 'user@.example.com' }),
    bad('email: two dots in the domain', 'email', { email: 'user@example..com' }),
    bad('email: no top-level domain', 'email', { email: 'user@example' }),
    bad('email: one-letter top-level domain', 'email', { email: 'user@example.c' }),
    bad('email: space in the local part', 'email', { email: 'us er@example.com' }),
    bad('email: space in the domain', 'email', { email: 'user@exam ple.com' }),
    bad('email: accented letter in the local part', 'email', { email: 'né@example.com' }),
    // Passwords
    row('password: 8 characters', { password: 'Passw0rd' }),
    row('password: 128 characters', { password: pad(128, 'p') }),
    bad('password: 129 characters', 'password', { password: pad(129, 'p') }),
    bad('password: 7 characters', 'password', { password: 'Passw0r' }),
    bad('password: 1 character', 'password', { password: 'p' }),
    bad('password: empty', 'password', { password: '' }),
    bad('password: left out', 'password', { omit: 'password' }),
    row('password: 8 spaces count as 8 characters', { password: '<SP><SP><SP><SP><SP><SP><SP><SP>' }),
    row('password: accents and symbols', { password: 'pässwörd-€-123' }),
    row('password: the same as the email address', { email: 'same-UNIQUE8X@example.com', password: 'same-UNIQUE8X@example.com' }),
    // Several fields wrong at once
    bad('everything wrong: reports the email', 'email', { name: '', email: 'nope', password: 'x' }),
  ],
};
