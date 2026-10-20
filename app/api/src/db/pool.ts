import { Pool, PoolClient, types } from 'pg';
import { config } from '../config';

// Return BIGINT/COUNT(*) as numbers; all our values fit comfortably.
types.setTypeParser(20, (v) => parseInt(v, 10));

export const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
