import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const prelude = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'prelude.js'), 'utf8');
const lines = (text) => text.replace(/^\n+|\s+$/g, '').split('\n');

/**
 * A request. `as` names the user to send it as ("customer", "admin", "customer:2"); `pre` and `test` are script bodies,
 * with `PL` (see prelude.js) in scope. `body` is a string (it may use {{variables}}) or an object. `budgetMs` replaces the
 * environment's response-time budget for that one request.
 */
export function request({ name, method = 'GET', path, as, body, headers = {}, pre = '', test = '', budgetMs }) {
  const header = Object.entries({ ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }).map(([key, value]) => ({ key, value }));
  const item = {
    name,
    // An error in an async script would otherwise end the whole Newman run, so it becomes a failed test instead.
    event: [
      {
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: lines(
            `${prelude}\n(async () => {\n  await PL.prepare(${JSON.stringify({ as })});\n${pre}\n})().catch((error) => pm.test('the pre-request script ran: ' + error.message, () => { throw error; }));`,
          ),
        },
      },
    ],
    request: {
      method,
      header,
      url: `{{baseUrl}}${path}`,
      ...(body === undefined ? {} : { body: { mode: 'raw', raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2) } }),
    },
  };
  // Every request also has to answer within the environment's time budget (responseTimeMs).
  // `budgetMs` is for a request that is slow on purpose (the timeout card takes 5 seconds).
  const limit = budgetMs ? String(budgetMs) : "Number(pm.environment.get('responseTimeMs') || 3000)";
  const budget = `pm.test('responds within the time budget', () => pm.expect(pm.response.responseTime).to.be.below(${limit}));`;
  item.event.push({ listen: 'test', script: { type: 'text/javascript', exec: lines(`${prelude}\n(async () => {\n${test}\nawait PL.flush();\n})().catch((error) => pm.test('the test script ran: ' + error.message, () => { throw error; }));\n${budget}`) } });
  return item;
}

export const folder = (name, item) => ({ name, item });

export function collection(name, description, item) {
  return {
    info: {
      name,
      description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item,
  };
}
