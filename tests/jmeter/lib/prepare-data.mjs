// The data for a run, made through the API's test hooks (the same ones the k6 scripts use):
//   the catalogue (POST /test/generate, deterministic: a second run finds it there),
//   data/users.csv (POST /test/users/bulk: email, password, token),
//   data/products.csv (20 products of the run's own with a million in stock, so orders never run out).
//
//   node lib/prepare-data.mjs <api base url> <data dir> [--journey]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(fs.readFileSync(path.join(here, '../../shared/load-model.json'), 'utf8'));
const [base, dataDir, flag] = process.argv.slice(2);
const json = { 'content-type': 'application/json' };

async function call(method, url, body, headers = json, expected = [200, 201]) {
  const res = await fetch(`${base}${url}`, { method, headers, body: body && JSON.stringify(body) });
  if (!expected.includes(res.status)) throw new Error(`${method} ${url}: ${res.status} ${(await res.text()).slice(0, 200)}. Is the perf stack up, with the test hooks on?`);
  return res;
}

const { products, users, ordersPerUser, seed } = model.data;
await call('POST', '/test/generate', { products, users, ordersPerUser, seed }, json, [201, 409]);
console.log(`catalogue: ${products} generated products`);

if (flag === '--journey') {
  fs.mkdirSync(dataDir, { recursive: true });
  const bulk = await call('POST', '/test/users/bulk', { count: users });
  fs.writeFileSync(path.join(dataDir, 'users.csv'), (await bulk.text()).replace(/\r\n/g, '\n'));
  console.log(`${users} shoppers written to ${path.join(dataDir, 'users.csv')}`);

  const admin = await (await call('POST', '/test/users', { role: 'admin' })).json();
  const auth = { ...json, Authorization: `Bearer ${admin.accessToken}` };
  const run = Date.now();
  const ids = [];
  for (let i = 0; i < model.data.perfProducts; i++) {
    const res = await call('POST', '/api/v1/products', {
      sku: `PERF-${run}-${i}`,
      name: `zz Perf product ${run} ${i}`,
      description: 'Made by the JMeter suite.',
      category: 'books',
      priceCents: 1000 + i,
      stock: model.data.perfProductStock,
    }, auth);
    ids.push((await res.json()).data.id);
  }
  fs.writeFileSync(path.join(dataDir, 'products.csv'), `productId\n${ids.join('\n')}\n`);
  console.log(`${ids.length} products written to ${path.join(dataDir, 'products.csv')}`);
}
