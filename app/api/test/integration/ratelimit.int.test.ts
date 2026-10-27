import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../src/config';
import { trustedProxies } from '../../src/lib/trustedProxy';
import { app, resetStack } from './app';

const proxies = config.trustedProxies;

beforeEach(resetStack);
afterEach(async () => {
  config.trustedProxies = proxies;
  await trustedProxies.refresh();
});

let n = 0;
const fromIp = (ip = `198.51.100.${++n % 250}`) => request(app).get('/api/v1/categories').set('X-Forwarded-For', ip);

async function useUpLimit() {
  for (let i = 0; i < config.rateLimitPerMin; i++) expect((await fromIp()).status).toBe(200);
}

describe('PLS-24.6 the rate limit cannot be dodged with X-Forwarded-For', () => {
  it('ignores X-Forwarded-For from a client that is not the web proxy', async () => {
    await useUpLimit();
    const res = await fromIp();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('with rate-limit-bypass on, a new X-Forwarded-For gets a fresh limit', async () => {
    await request(app)
      .post('/test/bugs')
      .send({ enable: ['rate-limit-bypass'] })
      .expect(200);
    await useUpLimit();
    expect((await fromIp()).status).toBe(200);
  });

  it("believes the web proxy's X-Forwarded-For, so each browser keeps its own limit", async () => {
    config.trustedProxies = ['127.0.0.1', '::1'];
    await trustedProxies.refresh();
    for (let i = 0; i < config.rateLimitPerMin; i++) await fromIp('203.0.113.7').expect(200);
    expect((await fromIp('203.0.113.7')).status).toBe(429);
    expect((await fromIp('203.0.113.8')).status).toBe(200);
  });
});

describe('PLS-27.5 the rate limit is off in the perf profile', () => {
  const limit = config.rateLimitPerMin;
  afterEach(() => {
    config.rateLimitPerMin = limit;
  });

  it('lets any number of requests through when RATE_LIMIT_PER_MIN is 0', async () => {
    config.rateLimitPerMin = 0;
    for (let i = 0; i < limit * 2; i++) expect((await fromIp('198.51.100.9')).status).toBe(200);
  });

  it('is on again as soon as the setting is', async () => {
    config.rateLimitPerMin = 5;
    for (let i = 0; i < 5; i++) expect((await fromIp('198.51.100.10')).status).toBe(200);
    expect((await fromIp('198.51.100.10')).status).toBe(429);
  });
});
