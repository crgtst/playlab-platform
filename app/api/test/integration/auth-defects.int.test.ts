import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../src/db/pool';
import { app, resetStack } from './app';

const PASSWORD = 'Password123!';

beforeEach(resetStack);

/** A session of its own, so a defect affects only the requests that name it. */
async function session(...defects: string[]): Promise<string> {
  const id = (await request(app).post('/test/sessions').expect(201)).body.id;
  if (defects.length) await request(app).post('/test/bugs').set('X-Test-Session', id).send({ enable: defects }).expect(200);
  return id;
}

const as = (id: string) => ({ 'X-Test-Session': id });

async function customerToken(id: string) {
  const login = await request(app)
    .post('/api/v1/auth/login')
    .set(as(id))
    .send({ email: 'customer@playlab.test', password: PASSWORD })
    .expect(200);
  return { token: login.body.accessToken as string, user: login.body.user };
}

describe('PLS-24.2 jwt-alg-none', () => {
  /** A token for a made-up admin, signed with nothing. */
  function unsigned(sub: number) {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const iat = Math.floor(Date.now() / 1000);
    return `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: String(sub), role: 'admin', name: 'Mallory', email: 'admin@playlab.test', iat, exp: iat + 900 })}.`;
  }

  it('refuses an unsigned token', async () => {
    const id = await session();
    const [{ id: adminId }] = await query<{ id: number }>("SELECT id FROM users WHERE email = 'admin@playlab.test'");
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set(as(id))
      .set('Authorization', `Bearer ${unsigned(adminId)}`)
      .expect(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('with the defect on, an unsigned token is believed, and its claims make the caller an admin', async () => {
    const id = await session('jwt-alg-none');
    const [{ id: adminId }] = await query<{ id: number }>("SELECT id FROM users WHERE email = 'admin@playlab.test'");
    await request(app)
      .get('/api/v1/admin/users')
      .set(as(id))
      .set('Authorization', `Bearer ${unsigned(adminId)}`)
      .expect(200);
  });

  it('still refuses a token signed with another key, even with the defect on', async () => {
    const id = await session('jwt-alg-none');
    const { token } = await customerToken(id);
    const [header, payload] = token.split('.');
    await request(app).get('/api/v1/auth/me').set(as(id)).set('Authorization', `Bearer ${header}.${payload}.AAAA`).expect(401);
  });
});

describe('PLS-24.3 user-enumeration', () => {
  const failedLogin = (id: string, email: string) =>
    request(app).post('/api/v1/auth/login').set(as(id)).send({ email, password: 'wrong-password' });
  const reset = (id: string, email: string) => request(app).post('/api/v1/auth/forgot-password').set(as(id)).send({ email });

  it('answers a registered and an unknown email in the same way', async () => {
    const id = await session();
    const [known, unknown] = [await failedLogin(id, 'customer@playlab.test'), await failedLogin(id, 'nobody@playlab.test')];
    expect(unknown.status).toBe(known.status);
    expect(unknown.body.error.code).toBe(known.body.error.code);
    expect(unknown.body.error.message).toBe(known.body.error.message);
    const [knownReset, unknownReset] = [await reset(id, 'customer@playlab.test'), await reset(id, 'nobody@playlab.test')];
    expect(unknownReset.status).toBe(knownReset.status);
    expect(unknownReset.body).toEqual(knownReset.body);
  });

  it('with the defect on, both tell which emails have an account', async () => {
    const id = await session('user-enumeration');
    const [known, unknown] = [await failedLogin(id, 'customer@playlab.test'), await failedLogin(id, 'nobody@playlab.test')];
    expect([known.status, unknown.status]).toEqual([401, 404]);
    expect(known.body.error.message).not.toBe(unknown.body.error.message);
    expect((await reset(id, 'customer@playlab.test')).status).toBe(202);
    expect((await reset(id, 'nobody@playlab.test')).status).toBe(404);
  });
});

describe('PLS-24.4 mass-assignment-role', () => {
  const register = (id: string, email: string) =>
    request(app).post('/api/v1/auth/register').set(as(id)).send({ name: 'Eve Escalate', email, password: PASSWORD, role: 'admin' });

  it('ignores a role in the registration body', async () => {
    const id = await session();
    const res = await register(id, 'eve@playlab.test').expect(201);
    expect(res.body.user.role).toBe('customer');
  });

  it('with the defect on, registers an admin who can then use the admin routes', async () => {
    const id = await session('mass-assignment-role');
    const res = await register(id, 'eve@playlab.test').expect(201);
    expect(res.body.user.role).toBe('admin');
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set(as(id))
      .send({ email: 'eve@playlab.test', password: PASSWORD })
      .expect(200);
    await request(app).get('/api/v1/admin/users').set(as(id)).set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
  });

  it('only honours the roles that exist', async () => {
    const id = await session('mass-assignment-role');
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set(as(id))
      .send({ name: 'Eve', email: 'eve2@playlab.test', password: PASSWORD, role: 'owner' })
      .expect(201);
    expect(res.body.user.role).toBe('customer');
  });
});

describe('PLS-24.8 bfla-admin-users', () => {
  async function attempt(id: string) {
    const { token } = await customerToken(id);
    const [{ id: targetId }] = await query<{ id: number }>("SELECT id FROM users WHERE email = 'customer@playlab.test'");
    return {
      targetId,
      res: await request(app)
        .patch(`/api/v1/admin/users/${targetId}`)
        .set(as(id))
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'admin' }),
    };
  }

  it('refuses a customer, and leaves the user as it was', async () => {
    const { targetId, res } = await attempt(await session());
    expect(res.status).toBe(403);
    expect((await query<{ role: string }>('SELECT role FROM users WHERE id = $1', [targetId]))[0].role).toBe('customer');
  });

  it('with the defect on, lets a customer make themselves an admin', async () => {
    const { targetId, res } = await attempt(await session('bfla-admin-users'));
    expect(res.status).toBe(200);
    expect((await query<{ role: string }>('SELECT role FROM users WHERE id = $1', [targetId]))[0].role).toBe('admin');
  });

  it('still refuses a guest, even with the defect on', async () => {
    const id = await session('bfla-admin-users');
    await request(app).patch('/api/v1/admin/users/1').set(as(id)).send({ role: 'admin' }).expect(401);
  });
});
