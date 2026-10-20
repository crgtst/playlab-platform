import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { pool, query, withTransaction } from '../db/pool';
import { resetDatabase, SEED_PASSWORD } from '../db/seed/base';
import { createUser, FIXTURES } from '../db/seed/fixtures';
import { clock } from '../lib/clock';
import { hashToken, randomToken, signAccessToken } from '../lib/tokens';
import { resetRateLimits } from '../middleware/rateLimit';
import { asyncHandler, parse } from '../middleware/validate';

/** Only mounted when TEST_HOOKS=true. Otherwise every /test/* path is a 404. */
export const testRouter = Router();

testRouter.get('/', (_req, res) => {
  res.json({
    testHooks: true,
    hooks: ['POST /test/reset', 'POST /test/seed', 'POST /test/users', 'GET /test/mailbox/{email}', 'GET|POST /test/clock'],
    fixtures: Object.keys(FIXTURES),
  });
});

testRouter.post(
  '/reset',
  asyncHandler(async (_req: Request, res: Response) => {
    const started = Date.now();
    clock.reset();
    await resetDatabase();
    resetRateLimits();
    res.json({ status: 'reset', durationMs: Date.now() - started });
  }),
);

const seedSchema = z.object({
  fixtures: z.array(z.enum(Object.keys(FIXTURES) as [string, ...string[]])).min(1, 'Name at least one fixture'),
});

testRouter.post(
  '/seed',
  asyncHandler(async (req: Request, res: Response) => {
    const { fixtures } = parse(seedSchema, req.body);
    const result = await withTransaction(async (client) => {
      const out: Record<string, unknown> = {};
      for (const name of fixtures) out[name] = await FIXTURES[name](client);
      return out;
    });
    res.status(201).json({ data: result });
  }),
);

const userSchema = z.object({
  role: z.enum(['customer', 'admin', 'support']).default('customer'),
  name: z.string().trim().min(1).max(500).optional(),
  email: z.string().trim().email().optional(),
});

testRouter.post(
  '/users',
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(userSchema, req.body ?? {});
    const result = await withTransaction(async (client) => {
      const user = await createUser(client, { role: body.role, name: body.name ?? `Test ${body.role}`, email: body.email });
      const refreshToken = randomToken();
      await client.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
        user.id,
        hashToken(refreshToken),
        new Date(clock.nowMs() + config.refreshTokenTtlSec * 1000),
      ]);
      return {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        password: SEED_PASSWORD,
        accessToken: signAccessToken(user),
        refreshToken,
      };
    });
    res.status(201).json(result);
  }),
);

testRouter.get(
  '/mailbox/:email',
  asyncHandler(async (req: Request, res: Response) => {
    const rows = await query('SELECT * FROM mailbox WHERE to_email = $1 ORDER BY created_at DESC, id DESC', [req.params.email]);
    res.json({
      data: rows.map((m: any) => ({
        id: m.id,
        to: m.to_email,
        type: m.type,
        subject: m.subject,
        body: m.body,
        link: m.link,
        createdAt: m.created_at,
      })),
    });
  }),
);

testRouter.delete(
  '/mailbox/:email',
  asyncHandler(async (req: Request, res: Response) => {
    await pool.query('DELETE FROM mailbox WHERE to_email = $1', [req.params.email]);
    res.status(204).end();
  }),
);

const clockSchema = z
  .object({
    now: z.string().datetime({ offset: true, message: 'now must be an ISO 8601 date-time' }).optional(),
    offsetMs: z.number().int().optional(),
    advanceMs: z.number().int().optional(),
  })
  .refine((v) => [v.now, v.offsetMs, v.advanceMs].filter((x) => x !== undefined).length <= 1, {
    message: 'Send only one of now, offsetMs or advanceMs',
  });

testRouter.get('/clock', (_req, res) => res.json(clock.state()));

testRouter.post('/clock', (req: Request, res: Response) => {
  const body = parse(clockSchema, req.body ?? {});
  if (body.now) clock.set(new Date(body.now));
  else if (body.offsetMs !== undefined) clock.setOffset(body.offsetMs);
  else if (body.advanceMs !== undefined) clock.setOffset(clock.state().offsetMs + body.advanceMs);
  else clock.reset();
  res.json(clock.state());
});
