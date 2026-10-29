import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { typeErrors, z } from '../lib/zod';
import { config } from '../config';
import { pool, query, withTransaction } from '../db/pool';
import { getSeedPasswordHash, resetDatabase, SEED_PASSWORD } from '../db/seed/base';
import { createUser, FIXTURES } from '../db/seed/fixtures';
import { generateData } from '../db/seed/generate';
import { providerStateExamples, resolveStates } from '../db/seed/providerStates';
import { ApiError } from '../lib/errors';
import { toCsv } from '../lib/csv';
import { clock } from '../lib/clock';
import { hashToken, randomToken, signAccessToken } from '../lib/tokens';
import { resetRateLimits } from '../middleware/rateLimit';
import { faults } from '../middleware/testFaults';
import { logs } from '../lib/logger';
import { requireKnownTestSession, TEST_SESSION_COOKIE, testSessions } from '../lib/testSessions';
import { BUG_NAMES, bugs } from '../lib/bugs';
import { events } from '../lib/events';
import { TEST_HOOK_LIST, testGuide } from '../lib/testGuide';
import { asyncHandler, parse } from '../middleware/validate';

/** Only mounted when TEST_HOOKS=true. Otherwise every /test/* path is a 404. */
export const testRouter = Router();
testRouter.use(requireKnownTestSession);

testRouter.get('/', (_req, res) => {
  res.json({
    testHooks: true,
    hooks: TEST_HOOK_LIST,
    bugs: BUG_NAMES,
    fixtures: Object.keys(FIXTURES),
  });
});

/** Accounts, cards, codes, fixtures, scenarios and defects on one page (the web app's Test guide). */
testRouter.get('/guide', (_req, res) => res.json(testGuide()));

testRouter.post(
  '/reset',
  asyncHandler(async (_req: Request, res: Response) => {
    const started = Date.now();
    // Ends every test session and resets the global defects, clock, latency and chaos rules.
    testSessions.resetAll();
    logs.clear();
    await resetDatabase();
    resetRateLimits();
    events.emitEvent('stockReset');
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

const bulkSchema = z.object({
  count: z
    .number(typeErrors({ required: 'count is required, e.g. 500', invalid: 'count must be a whole number' }))
    .int('count must be a whole number')
    .min(1)
    .max(5000, 'count can be at most 5000'),
});

/** Customers for load tests, as CSV (email, password, token) for a JMeter CSV Data Set or a k6 SharedArray. */
testRouter.post(
  '/users/bulk',
  asyncHandler(async (req: Request, res: Response) => {
    const { count } = parse(bulkSchema, req.body ?? {});
    const batch = crypto.randomBytes(4).toString('hex');
    const users = await withTransaction(async (client) => {
      const emails = Array.from({ length: count }, (_, i) => `bulk-${batch}-${String(i + 1).padStart(5, '0')}@playlab.test`);
      const { rows } = await client.query(
        `INSERT INTO users (email, name, password_hash, role, email_verified, created_at)
         SELECT e, 'Bulk User ' || ord, $2, 'customer', TRUE, $3
           FROM unnest($1::text[]) WITH ORDINALITY AS g(e, ord)
         RETURNING *`,
        [emails, getSeedPasswordHash(), clock.now()],
      );
      return rows.sort((a: any, b: any) => a.id - b.id);
    });
    res
      .status(201)
      .type('text/csv')
      .send(
        toCsv(
          ['email', 'password', 'token'],
          users.map((u: any) => [u.email, SEED_PASSWORD, signAccessToken(u)]),
        ),
      );
  }),
);

const generateSchema = z.object({
  products: z.number().int().min(0).max(50_000).default(1000),
  users: z.number().int().min(0).max(5000).default(100),
  ordersPerUser: z.number().int().min(0).max(20).default(3),
  seed: z.number().int().min(0).max(2_147_483_647).default(1),
});

/** The same seed always creates the same data. Reset first to get the same ids and order numbers too. */
testRouter.post(
  '/generate',
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(generateSchema, req.body ?? {});
    const started = Date.now();
    const result = await withTransaction((client) => generateData(client, body));
    res.status(201).json({ ...result, seed: body.seed, durationMs: Date.now() - started });
  }),
);

// Pact sends { state } (v2) or { states: [...] } (v3) plus the consumer name and an action; the extras are ignored.
const providerStateSchema = z
  .object({
    state: z.string().trim().min(1).optional(),
    states: z.array(z.string().trim().min(1)).optional(),
  })
  .refine((v) => v.state || v.states?.length, { message: 'Send a state name, or a list in states' });

testRouter.get('/provider-states', (_req, res) => res.json({ data: providerStateExamples() }));

/** Sets up the data a Pact provider state names. Unknown names are a 404 and nothing is changed. */
testRouter.post(
  '/provider-states',
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(providerStateSchema, req.body ?? {});
    const names = [...(body.state ? [body.state] : []), ...(body.states ?? [])];
    const { found, unknown } = resolveStates(names);
    if (unknown.length)
      throw new ApiError(404, 'PROVIDER_STATE_UNKNOWN', `Unknown provider state: ${unknown.map((n) => `"${n}"`).join(', ')}`, {
        known: providerStateExamples(),
      });
    const data = await withTransaction(async (client) => {
      const out = [];
      for (const f of found) out.push({ state: f.name, result: await f.state.run(client, f.match) });
      return out;
    });
    res.json({ data });
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
    now: z.string().datetime({ offset: true, error: 'now must be an ISO 8601 date-time' }).optional(),
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

const methodSchema = z
  .string()
  .trim()
  .transform((m) => m.toUpperCase())
  .refine((m) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m), 'Use GET, POST, PUT, PATCH or DELETE')
  .optional();
const pathSchema = z
  .string(typeErrors({ required: 'path is required, e.g. /api/v1/products*' }))
  .trim()
  .refine((p) => p.startsWith('/'), 'path must start with /')
  .refine((p) => !p.startsWith('/test'), 'Test hooks cannot be slowed down or failed');

const latencySchema = z.object({
  path: pathSchema,
  method: methodSchema,
  delayMs: z
    .number(typeErrors({ required: 'delayMs is required' }))
    .int()
    .min(1)
    .max(60_000),
});

const chaosSchema = z
  .object({
    path: pathSchema,
    method: methodSchema,
    failureRate: z.number().min(0).max(1).optional(),
    failNext: z.number().int().min(1).max(1000).optional(),
    status: z.number().int().min(400).max(599).default(500),
  })
  .refine((v) => (v.failureRate === undefined) !== (v.failNext === undefined), {
    message: 'Send exactly one of failureRate (0-1) or failNext (a count)',
  });

testRouter.get('/latency', (_req, res) => res.json({ data: faults.latency() }));
testRouter.post('/latency', (req: Request, res: Response) => {
  const body = parse(latencySchema, req.body ?? {});
  res.status(201).json({ data: faults.addLatency({ path: body.path, method: body.method ?? null, delayMs: body.delayMs }) });
});
testRouter.delete('/latency', (_req, res) => {
  faults.clearLatency();
  res.status(204).end();
});

testRouter.get('/chaos', (_req, res) => res.json({ data: faults.chaos() }));
testRouter.post('/chaos', (req: Request, res: Response) => {
  const body = parse(chaosSchema, req.body ?? {});
  const rule = faults.addChaos({
    path: body.path,
    method: body.method ?? null,
    failureRate: body.failureRate ?? 0,
    failNext: body.failNext ?? null,
    status: body.status,
  });
  res.status(201).json({ data: rule });
});
testRouter.delete('/chaos', (_req, res) => {
  faults.clearChaos();
  res.status(204).end();
});

const bugNameSchema = z.enum(BUG_NAMES as [string, ...string[]], {
  error: `Unknown bug. Known bugs: ${BUG_NAMES.join(', ')}`,
});
const bugsSchema = z
  .object({ enable: z.array(bugNameSchema).optional(), disable: z.array(bugNameSchema).optional() })
  .refine((v) => (v.enable?.length ?? 0) + (v.disable?.length ?? 0) > 0, { message: 'Send enable and/or disable lists of bug names' });

testRouter.get('/bugs', (_req, res) => res.json({ data: bugs.list() }));
testRouter.post('/bugs', (req: Request, res: Response) => {
  const body = parse(bugsSchema, req.body ?? {});
  bugs.disable((body.disable ?? []) as typeof BUG_NAMES);
  bugs.enable((body.enable ?? []) as typeof BUG_NAMES);
  res.json({ data: bugs.list(), active: bugs.active() });
});
testRouter.delete('/bugs', (_req, res) => {
  bugs.clear();
  res.status(204).end();
});

const logsSchema = z.object({
  correlationId: z
    .string(typeErrors({ required: 'correlationId is required' }))
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'correlationId must be 1 to 64 letters, digits, hyphens or underscores'),
});

/** The log lines for one request, already redacted (PLS-25.2). Cleared by POST /test/reset. */
testRouter.get('/logs', (req: Request, res: Response) => {
  const { correlationId } = parse(logsSchema, req.query);
  res.json({ data: logs.forCorrelationId(correlationId) });
});

/**
 * Starts a test session (PLS-28.6). Send its id as X-Test-Session (or rely on the test_session cookie) and that
 * request uses the session's own defects, clock, latency and chaos rules and rate-limit counters.
 */
testRouter.post('/sessions', (_req: Request, res: Response) => {
  const session = testSessions.create();
  res.cookie(TEST_SESSION_COOKIE, session.id, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.status(201).json({ id: session.id, idleTimeoutMs: config.testSessionIdleMs });
});
