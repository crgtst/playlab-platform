import fs from 'fs';
import path from 'path';
import { Request, Response, Router } from 'express';
import { typeErrors, z } from '../lib/zod';
import { config } from '../config';
import { query, withTransaction } from '../db/pool';
import { cardSchema } from '../lib/cardSchema';
import { clock } from '../lib/clock';
import { ApiError, notFound } from '../lib/errors';
import { chargeCard } from '../lib/payments';
import { TEST_SESSION_PARAM, testSessions } from '../lib/testSessions';
import { hashToken, randomToken } from '../lib/tokens';
import { requireAuth } from '../middleware/auth';
import { noStore } from '../middleware/noStore';
import { asyncHandler, parse } from '../middleware/validate';
import { buildCartView } from '../services/cart';
import { bugs } from '../lib/bugs';

/** /api/v1/payments: called by the shop (first-party, authenticated). */
export const paymentsRouter = Router();
paymentsRouter.use(noStore, requireAuth);

/** /pay: the hosted payment frame, served on the API origin so it is cross-origin to the shop. */
export const payFrameRouter = Router();

function intentView(r: any) {
  return {
    id: r.id,
    amountCents: r.amount_cents,
    currency: 'EUR',
    status: r.status,
    cardLast4: r.card_last4,
    used: !!r.used_at,
    createdAt: r.created_at,
  };
}

paymentsRouter.post(
  '/intents',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;
    const cart = await query<{ id: string }>('SELECT id FROM carts WHERE user_id = $1', [user.id]);
    const view = await buildCartView(cart[0]?.id ?? null);
    if (view.items.length === 0) throw new ApiError(422, 'CART_EMPTY', 'Your cart is empty');
    const secret = randomToken();
    const rows = await query(
      `INSERT INTO payment_intents (user_id, amount_cents, client_secret_hash, created_at) VALUES ($1, $2, $3, $4) RETURNING *`,
      [user.id, view.totals.totalCents, hashToken(secret), clock.now()],
    );
    const intent = rows[0];
    const frame = new URL(config.paymentFrameUrl);
    frame.searchParams.set('intent', intent.id);
    frame.searchParams.set('secret', secret);
    // The frame is on the API origin, so it gets the shop's test session from its URL (PLS-28.10).
    const testSession = testSessions.currentId();
    if (testSession) frame.searchParams.set(TEST_SESSION_PARAM, testSession);
    res.status(201).json({ data: { ...intentView(intent), clientSecret: secret, frameUrl: frame.toString() } });
  }),
);

paymentsRouter.get(
  '/intents/:id',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const rows = /^[0-9a-f-]{36}$/i.test(req.params.id)
      ? await query('SELECT * FROM payment_intents WHERE id = $1 AND user_id = $2', [req.params.id, req.user!.id])
      : [];
    if (!rows[0]) throw notFound('Payment not found');
    res.json({ data: intentView(rows[0]) });
  }),
);

// ---------- hosted frame ----------

const FRAME_HTML = fs.readFileSync(path.join(process.cwd(), 'pay', 'frame.html'), 'utf8');

payFrameRouter.get('/frame', (_req, res) => {
  const html = FRAME_HTML.replace('__SHOP_ORIGINS__', JSON.stringify(config.shopOrigins).replace(/</g, '\\u003c')).replace(
    '__BUGS__',
    JSON.stringify(bugs.active()),
  );
  res.setHeader('Content-Security-Policy', `frame-ancestors ${config.shopOrigins.join(' ')}`);
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(html);
});

async function intentForSecret(id: string, secret: unknown) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || typeof secret !== 'string' || !secret) throw notFound('Payment not found');
  const rows = await query('SELECT * FROM payment_intents WHERE id = $1 AND client_secret_hash = $2', [id, hashToken(secret)]);
  if (!rows[0]) throw notFound('Payment not found');
  return rows[0];
}

payFrameRouter.get(
  '/intents/:id',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: intentView(await intentForSecret(req.params.id, req.query.secret)) });
  }),
);

const confirmSchema = cardSchema.extend({ clientSecret: z.string(typeErrors({ required: 'clientSecret is required' })).min(1) });

payFrameRouter.post(
  '/intents/:id/confirm',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const body = parse(confirmSchema, req.body);
    const intent = await intentForSecret(req.params.id, body.clientSecret);
    if (intent.status === 'succeeded') throw new ApiError(409, 'PAYMENT_ALREADY_CONFIRMED', 'This payment has already been taken');
    // Claim the intent so two concurrent confirms cannot both charge.
    const claimed = await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE payment_intents SET status = 'processing' WHERE id = $1 AND status IN ('requires_payment', 'declined', 'timed_out') RETURNING id`,
        [intent.id],
      );
      return r.rowCount === 1;
    });
    if (!claimed) throw new ApiError(409, 'PAYMENT_IN_PROGRESS', 'This payment is already being processed');

    const last4 = body.cardNumber.slice(-4);
    try {
      await chargeCard(body.cardNumber);
    } catch (err) {
      const status = err instanceof ApiError && err.status === 402 ? 'declined' : 'timed_out';
      await query('UPDATE payment_intents SET status = $1, card_last4 = $2 WHERE id = $3', [status, last4, intent.id]);
      throw err;
    }
    const rows = await query(`UPDATE payment_intents SET status = 'succeeded', card_last4 = $1 WHERE id = $2 RETURNING *`, [
      last4,
      intent.id,
    ]);
    res.json({ data: intentView(rows[0]) });
  }),
);
