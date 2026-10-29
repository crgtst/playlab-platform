import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { config } from '../../src/config';
import { BUG_NAMES } from '../../src/lib/bugs';
import { app, resetStack } from './app';

const shared = (file: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../tests/shared', file), 'utf8'));

beforeEach(resetStack);

describe('PLS-12.6 GET /test/guide', () => {
  it('lists the seeded accounts, and each one can log in with the password it shows', async () => {
    const { body } = await request(app).get('/test/guide').expect(200);
    expect(body.accounts.map((a: { role: string }) => a.role)).toEqual(['customer', 'admin', 'support']);
    for (const a of body.accounts) {
      await request(app).post('/api/v1/auth/login').send({ email: a.email, password: a.password }).expect(200);
    }
  });

  it('agrees with tests/shared on accounts, cards and discount codes', async () => {
    const { body } = await request(app).get('/test/guide').expect(200);
    const accounts = shared('accounts.json');
    for (const a of body.accounts) expect(a).toEqual(accounts[a.role]);

    const cards = shared('cards.json');
    for (const c of body.cards.list) expect(c.number, c.kind).toBe(cards[c.kind].number);
    expect(body.cards.defaults).toEqual({ expiry: cards.defaults.expiry, cvc: cards.defaults.cvc });

    expect(body.discounts.map((d: { code: string }) => d.code)).toEqual(
      shared('discounts.json').seeded.map((d: { code: string }) => d.code),
    );
  });

  it('describes every fixture, and every fixture it lists can be seeded', async () => {
    const hooks = await request(app).get('/test').expect(200);
    const { body } = await request(app).get('/test/guide').expect(200);
    expect(body.fixtures.map((f: { name: string }) => f.name)).toEqual(hooks.body.fixtures);
    for (const f of body.fixtures) expect(f.description.length, f.name).toBeGreaterThan(10);
    await request(app)
      .post('/test/seed')
      .send({ fixtures: body.fixtures.map((f: { name: string }) => f.name) })
      .expect(201);
  });

  it('lists every defect, with the AC it breaks, and shows only the ones on for the caller’s session', async () => {
    const session = (await request(app).post('/test/sessions').expect(201)).body.id;
    await request(app)
      .post('/test/bugs')
      .set('X-Test-Session', session)
      .send({ enable: ['order-leak'] })
      .expect(200);

    const mine = (await request(app).get('/test/guide').set('X-Test-Session', session).expect(200)).body.bugs;
    expect(mine.map((b: { name: string }) => b.name)).toEqual(BUG_NAMES);
    expect(mine.filter((b: { enabled: boolean }) => b.enabled).map((b: { name: string }) => b.name)).toEqual(['order-leak']);
    for (const b of mine) expect(b.ac, b.name).toMatch(/^PLS-\d+\.\d+/);

    const others = (await request(app).get('/test/guide').expect(200)).body.bugs;
    expect(others.some((b: { enabled: boolean }) => b.enabled)).toBe(false);
  });

  it('has scenarios that name real ACs, and links the page can follow', async () => {
    const { body } = await request(app).get('/test/guide').expect(200);
    expect(body.scenarios.length).toBeGreaterThan(5);
    for (const s of body.scenarios) {
      expect(s.steps.length, s.title).toBeGreaterThan(1);
      expect(s.ac).toMatch(/^PLS-\d+\.\d+/);
    }
    expect(body.links.map((l: { href: string }) => l.href)).toContain('/api/docs');
  });

  it('is a 404 when test hooks are off', async () => {
    const testHooks = config.testHooks;
    config.testHooks = false;
    try {
      await request(createApp()).get('/test/guide').expect(404);
    } finally {
      config.testHooks = testHooks;
    }
  });
});
