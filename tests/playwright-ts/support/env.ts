import fs from 'fs';
import path from 'path';

/**
 * Where the stack is. Ports come from app/.env, the same file docker compose reads, so the suite follows whatever
 * ports the stack was started with. API_URL and WEB_URL override them, for example in CI.
 */
function readDotEnv(): Record<string, string> {
  try {
    const text = fs.readFileSync(path.join(__dirname, '../../../app/.env'), 'utf8');
    const entries = text.split('\n').flatMap((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      return m ? [[m[1], m[2]] as const] : [];
    });
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

const fromFile = readDotEnv();
const setting = (name: string, fallback: string) => process.env[name] ?? fromFile[name] ?? fallback;

// The fallbacks are docker-compose.yml's defaults.
export const API_URL = process.env.API_URL ?? `http://localhost:${setting('API_PORT', '3000')}`;
export const WEB_URL = process.env.WEB_URL ?? `http://localhost:${setting('WEB_PORT', '5173')}`;
