import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { query } from '../../src/db/pool';
import { app, resetStack } from './app';

// The parts of tests/shared/ that only exist once the stack runs (the unit test shared-contract.test.ts covers the rest).

const discounts = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../tests/shared/discounts.json'), 'utf8'));

beforeEach(resetStack);

it('each fixture in discounts.json creates the code it lists', async () => {
  for (const d of discounts.fromFixtures) {
    await request(app)
      .post('/test/seed')
      .send({ fixtures: [d.fixture] })
      .expect(201);
    const rows = await query<{ type: string; value: number; min_spend_cents: number }>(
      'SELECT type, value, min_spend_cents FROM discount_codes WHERE code = $1',
      [d.code],
    );
    expect(rows[0], d.code).toEqual({ type: d.type, value: d.value, min_spend_cents: d.minSpendCents ?? 0 });
  }
});
