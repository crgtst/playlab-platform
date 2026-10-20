import fs from 'fs';
import path from 'path';
import { pool } from './pool';

export async function migrate(): Promise<void> {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
}
