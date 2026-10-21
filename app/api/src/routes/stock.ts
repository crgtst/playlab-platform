import { Request, Response, Router } from 'express';
import { query } from '../db/pool';
import { isBugOn } from '../lib/bugs';
import { events, StockChanged } from '../lib/events';
import { validationError } from '../lib/errors';
import { asyncHandler } from '../middleware/validate';

export const stockRouter = Router();

const PING_MS = 15_000;

/**
 * Server-Sent Events: GET /api/v1/stock/stream?ids=1,2
 * Sends a `snapshot` event first, then a `stock` event whenever a watched product's stock changes,
 * plus a `: ping` comment every 15 s. Without `ids`, every product is watched.
 */
stockRouter.get(
  '/stream',
  asyncHandler(async (req: Request, res: Response) => {
    const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
    const ids = raw ? raw.split(',').map((s) => Number(s.trim())) : [];
    if (ids.some((n) => !Number.isInteger(n) || n <= 0) || ids.length > 100) {
      throw validationError([{ field: 'ids', message: 'ids must be a comma-separated list of up to 100 product ids' }]);
    }
    const watched = ids.length ? new Set(ids) : null;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const snapshot = async () => {
      const rows = await query<{ id: number; stock: number }>(
        watched ? 'SELECT id, stock FROM products WHERE id = ANY($1) ORDER BY id' : 'SELECT id, stock FROM products ORDER BY id',
        watched ? [[...watched]] : [],
      );
      send('snapshot', { products: rows.map((r) => ({ productId: r.id, stock: r.stock })), at: new Date().toISOString() });
    };

    const onChange = (e: StockChanged) => {
      // stale-stock: the stream stays open but stops reporting changes.
      if (isBugOn('stale-stock')) return;
      if (!watched || watched.has(e.productId)) send('stock', { ...e, at: new Date().toISOString() });
    };
    const onReset = () => {
      if (!isBugOn('stale-stock')) snapshot().catch(() => undefined);
    };

    events.onEvent('stockChanged', onChange);
    events.onEvent('stockReset', onReset);
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);
    req.on('close', () => {
      clearInterval(ping);
      events.off('stockChanged', onChange);
      events.off('stockReset', onReset);
    });

    try {
      await snapshot();
    } catch {
      res.end();
    }
  }),
);
