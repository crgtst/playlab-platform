import fs from 'fs';
import path from 'path';

/**
 * Where the stack is. The port comes from app/.env, the same file docker compose reads. API_URL overrides it, for example in CI.
 */
function readDotEnv(): Record<string, string> {
  try {
    const text = fs.readFileSync(path.join(__dirname, '../../../app/.env'), 'utf8');
    const entries = text.split('\n').flatMap((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      return m ? [[m[1], m[2]] as const] : [];
    });
    return Object.fromEntries(entries);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
    throw error;
  }
}

const fromFile = readDotEnv();
export const API_URL = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? fromFile.API_PORT ?? '3000'}`;
export const WEB_URL = process.env.WEB_URL ?? `http://localhost:${process.env.WEB_PORT ?? fromFile.WEB_PORT ?? '5173'}`;
