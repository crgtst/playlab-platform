import fs from 'fs';
import path from 'path';

/** Reads app/.env the way docker compose does, so the suite finds the stack on whatever ports it was started with. */
function readDotEnv(): Record<string, string> {
  try {
    const text = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
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
export const API_PORT = setting('API_PORT', '3000');
export const WEB_PORT = setting('WEB_PORT', '5173');
export const API_URL = process.env.API_URL ?? `http://localhost:${API_PORT}`;
export const WEB_URL = process.env.WEB_URL ?? `http://localhost:${WEB_PORT}`;
