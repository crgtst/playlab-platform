import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

// Copying .env.example and changing a port must not leave URLs pointing at the old port.

const appDir = path.join(__dirname, '../..');
const envExample = fs.readFileSync(path.join(appDir, '.env.example'), 'utf8');
const compose = YAML.parse(fs.readFileSync(path.join(appDir, 'docker-compose.yml'), 'utf8'));
const apiEnv: Record<string, string> = compose.services.api.environment;

const DERIVED = {
  PAYMENT_FRAME_URL: '${API_PORT:-3000}',
  SHOP_ORIGINS: '${WEB_PORT:-5173}',
  PUBLIC_WEB_URL: '${WEB_PORT:-5173}',
};

describe('PLS-12.5 URLs follow the host ports', () => {
  it.each(Object.keys(DERIVED))('.env.example leaves %s unset', (name) => {
    expect(envExample).not.toMatch(new RegExp(`^${name}=`, 'm'));
  });

  it.each(Object.entries(DERIVED))('docker-compose.yml derives %s from %s', (name, port) => {
    expect(apiEnv[name]).toContain(port);
  });
});
