import fs from 'fs';
import { AddressInfo } from 'net';
import path from 'path';
import { Server } from 'http';
import { Verifier } from '@pact-foundation/pact';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createApp } from '../../src/app';
import { resetStack } from './app';

/**
 * PLS-26.4: the web app's Pact contracts (app/web/pacts, written by `npm run test:pact` in app/web) are verified against the
 * real API. Each provider state is set up by calling `POST /test/provider-states`, the hook that exists for this.
 */
const PACT_DIR = path.resolve(__dirname, '../../../web/pacts');

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await resetStack();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const post = (url: string, body: unknown) =>
  fetch(`${baseUrl}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** One handler for each state name a pact file uses. All of them call the provider-states hook. */
function stateHandlers(files: string[]) {
  const names = new Set<string>();
  for (const f of files) {
    for (const i of JSON.parse(fs.readFileSync(f, 'utf8')).interactions) for (const s of i.providerStates ?? []) names.add(s.name);
  }
  return Object.fromEntries(
    [...names].map((name) => [
      name,
      async () => {
        const res = await post('/test/provider-states', { state: name });
        if (!res.ok) throw new Error(`Provider state "${name}" failed: ${res.status} ${await res.text()}`);
      },
    ]),
  );
}

describe('Pact provider verification', () => {
  it('PLS-26.4 the API keeps every promise the web app contracts record', async () => {
    const files = fs
      .readdirSync(PACT_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(PACT_DIR, f));
    if (!files.length) throw new Error(`No pact files in ${PACT_DIR}. Run "npm run test:pact" in app/web first`);

    await new Verifier({
      provider: 'playlab-api',
      providerBaseUrl: baseUrl,
      pactUrls: files,
      stateHandlers: stateHandlers(files),
      // A contract cannot hold a real token, so it sends a placeholder and a new user's token goes in here instead.
      requestFilter: (req, _res, next) => {
        if (!req.headers.authorization) return next();
        post('/test/users', { role: 'customer' })
          .then((r) => r.json() as Promise<{ accessToken: string }>)
          .then(({ accessToken }) => {
            req.headers.authorization = `Bearer ${accessToken}`;
            next();
          })
          .catch(next);
      },
      logLevel: 'warn',
    }).verifyProvider();
  }, 120_000);
});
