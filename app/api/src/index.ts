import { createApp } from './app';
import { config } from './config';
import { migrate } from './db/migrate';
import { pool } from './db/pool';
import { getSeedPasswordHash, seedIfEmpty } from './db/seed/base';
import { logger } from './lib/logger';
import { runningUnsafe, startupProblem } from './lib/startupGuard';
import { attachOrderSocket } from './realtime/ws';

async function waitForDatabase(attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function main() {
  const problem = startupProblem(process.env, config.testHooks);
  if (problem) throw new Error(problem);
  if (runningUnsafe(process.env, config.testHooks)) {
    logger.warn('PLAYLAB_ALLOW_UNSAFE=true: test hooks are on in production. Never expose this API to a network.');
  }
  await waitForDatabase();
  await migrate();
  getSeedPasswordHash();
  const seeded = await seedIfEmpty();
  logger.info(seeded ? 'Database seeded with base data' : 'Database already has data; skipping seed');

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`PlayLab Shop API listening on :${config.port} (TEST_HOOKS=${config.testHooks})`);
  });
  attachOrderSocket(server);

  const shutdown = () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
