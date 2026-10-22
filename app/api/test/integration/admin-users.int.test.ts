import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../src/db/pool';
import { app, resetStack } from './app';

const PASSWORD = 'Password123!';
let admin: string;

async function logIn(email: string, password = PASSWORD) {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}
async function auth(email: string) {
  return `Bearer ${(await logIn(email)).body.accessToken}`;
}
async function idOf(email: string): Promise<number> {
  return (await query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]))[0].id;
}

beforeEach(async () => {
  await resetStack();
  admin = await auth('admin@playlab.test');
});

describe('PLS-23.1 GET /admin/users', () => {
  it('filters by role and by name or email, and pages', async () => {
    for (const name of ['Sam Second', 'Sam Third']) await request(app).post('/test/users').send({ role: 'support', name }).expect(201);
    await request(app).post('/test/users').send({ role: 'customer', name: 'Sam Customer' }).expect(201);

    const support = await request(app).get('/api/v1/admin/users?role=support').set('Authorization', admin).expect(200);
    expect(support.body.data.map((u: { role: string }) => u.role)).toEqual(['support', 'support', 'support']);
    expect(support.body.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });

    const sams = await request(app).get('/api/v1/admin/users?role=support&q=sam').set('Authorization', admin).expect(200);
    expect(sams.body.data.map((u: { name: string }) => u.name)).toEqual(['Sam Support', 'Sam Second', 'Sam Third']);

    const byEmail = await request(app).get('/api/v1/admin/users?q=customer@playlab').set('Authorization', admin).expect(200);
    expect(byEmail.body.data.map((u: { email: string }) => u.email)).toEqual(['customer@playlab.test']);

    const page2 = await request(app).get('/api/v1/admin/users?limit=2&page=2').set('Authorization', admin).expect(200);
    expect(page2.body.meta).toEqual({ page: 2, limit: 2, total: 6, totalPages: 3 });
    expect(page2.body.data).toHaveLength(2);
    expect(page2.headers['x-total-count']).toBe('6');
  });

  it('shows lock state and never shows password hashes', async () => {
    const res = await request(app).get('/api/v1/admin/users?q=customer@').set('Authorization', admin).expect(200);
    expect(res.body.data[0]).toMatchObject({ email: 'customer@playlab.test', locked: false, lockedUntil: null, failedLogins: 0 });
    expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/);
  });
});

describe('PLS-23.2 role changes', () => {
  it('applies the new role from the next login, not to tokens already issued', async () => {
    const before = await auth('customer@playlab.test');
    const id = await idOf('customer@playlab.test');
    const res = await request(app).patch(`/api/v1/admin/users/${id}`).set('Authorization', admin).send({ role: 'support' }).expect(200);
    expect(res.body.data.role).toBe('support');

    await request(app).get('/api/v1/admin/users').set('Authorization', before).expect(403);
    await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', await auth('customer@playlab.test'))
      .expect(200);
  });
});

describe('PLS-23.3 unlocking', () => {
  it('lets a locked-out user log in straight away', async () => {
    for (let i = 0; i < 5; i++) await logIn('customer@playlab.test', 'wrong-password');
    expect((await logIn('customer@playlab.test')).status).toBe(423);
    const id = await idOf('customer@playlab.test');
    const listed = await request(app).get('/api/v1/admin/users?q=customer@').set('Authorization', admin);
    expect(listed.body.data[0].locked).toBe(true);

    const res = await request(app).patch(`/api/v1/admin/users/${id}`).set('Authorization', admin).send({ unlock: true }).expect(200);
    expect(res.body.data).toMatchObject({ locked: false, failedLogins: 0 });
    expect((await logIn('customer@playlab.test')).status).toBe(200);
  });
});

describe('PLS-23.4, 23.5 and 24.8 who may do what', () => {
  it('PLS-23.4 lets support list users but not change them', async () => {
    const support = await auth('support@playlab.test');
    const id = await idOf('customer@playlab.test');
    await request(app).get('/api/v1/admin/users').set('Authorization', support).expect(200);
    await request(app).patch(`/api/v1/admin/users/${id}`).set('Authorization', support).send({ role: 'admin' }).expect(403);
  });

  it('PLS-23.5 refuses customers the list', async () => {
    await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', await auth('customer@playlab.test'))
      .expect(403);
  });

  it('PLS-24.8 refuses customers any change, leaving the user as it was', async () => {
    const customer = await auth('customer@playlab.test');
    const id = await idOf('customer@playlab.test');
    await request(app).patch(`/api/v1/admin/users/${id}`).set('Authorization', customer).send({ role: 'admin' }).expect(403);
    expect((await query<{ role: string }>('SELECT role FROM users WHERE id = $1', [id]))[0].role).toBe('customer');
  });

  it('refuses guests', async () => {
    await request(app).get('/api/v1/admin/users').expect(401);
  });
});

describe('validation', () => {
  it('rejects an unknown role, an empty change and a missing user', async () => {
    const id = await idOf('customer@playlab.test');
    const bad = await request(app).patch(`/api/v1/admin/users/${id}`).set('Authorization', admin).send({ role: 'owner' }).expect(422);
    expect(bad.body.error.details[0].field).toBe('role');
    await request(app).patch(`/api/v1/admin/users/${id}`).set('Authorization', admin).send({}).expect(422);
    await request(app).patch('/api/v1/admin/users/99999').set('Authorization', admin).send({ unlock: true }).expect(404);
    await request(app).get('/api/v1/admin/users?role=owner').set('Authorization', admin).expect(422);
  });
});
