import { Client } from 'pg';

/** Creates the test database from scratch, then migrates and seeds it with the app's own code (PLS-29.5). */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const name = url.pathname.slice(1);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  process.env.DATABASE_URL = url.toString();
  const { migrate } = await import('../../src/db/migrate');
  const { seedIfEmpty } = await import('../../src/db/seed/base');
  const { pool } = await import('../../src/db/pool');
  try {
    await migrate();
    await seedIfEmpty();
  } finally {
    await pool.end();
  }
}
