import { Request, Response, Router } from 'express';
import { pool } from '../db/pool';
import { config } from '../config';

export const healthRouter = Router();

async function check(fn: () => Promise<unknown>): Promise<'up' | 'down'> {
  try {
    await fn();
    return 'up';
  } catch {
    return 'down';
  }
}

async function pingWeb() {
  const res = await fetch(config.webUrl, { signal: AbortSignal.timeout(2000) });
  if (!res.ok) throw new Error(`web returned ${res.status}`);
}

/** Readiness: 200 only when the API, the database and the web app all respond (PLS-12.4). */
healthRouter.get('/', async (_req: Request, res: Response) => {
  const [db, web] = await Promise.all([check(() => pool.query('SELECT 1')), check(pingWeb)]);
  const ok = db === 'up' && web === 'up';
  res.setHeader('Cache-Control', 'no-store');
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'unavailable',
    checks: { api: 'up', db, web },
    testHooks: config.testHooks,
    time: new Date().toISOString(),
  });
});

/** Liveness for the Docker healthcheck: API and database only (the web container waits on this). */
healthRouter.get('/live', async (_req: Request, res: Response) => {
  const db = await check(() => pool.query('SELECT 1'));
  res.setHeader('Cache-Control', 'no-store');
  res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'unavailable', checks: { api: 'up', db } });
});
