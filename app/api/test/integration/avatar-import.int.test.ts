import http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../src/config';
import { isBlockedAddress } from '../../src/lib/safeFetch';
import { app, resetStack } from './app';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

// Two servers answer the same requests: one on 127.0.0.1 (for addresses typed as numbers) and one on whatever "localhost" resolves to
// (127.0.0.1 or ::1 depending on the machine, which is also what the API's lookup returns).
let server: http.Server;
let localServer: http.Server;
let port: number;
let localPort: number;
let hits: string[] = [];
const allowedHosts = config.avatarImportAllowedHosts;

function handler(req: http.IncomingMessage, res: http.ServerResponse) {
  hits.push(req.url ?? '');
  if (req.url === '/avatar.png') return void res.writeHead(200, { 'Content-Type': 'image/png' }).end(PNG);
  if (req.url === '/avatar.jpg') return void res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(JPG);
  if (req.url === '/not-an-image.png') return void res.writeHead(200, { 'Content-Type': 'image/png' }).end('this is text');
  if (req.url === '/huge.png')
    return void res.writeHead(200, { 'Content-Type': 'image/png' }).end(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]));
  if (req.url === '/redirect.png') return void res.writeHead(302, { Location: '/avatar.png' }).end();
  res.writeHead(404).end();
}

beforeAll(async () => {
  server = http.createServer(handler);
  localServer = http.createServer(handler);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  await new Promise<void>((done) => localServer.listen(0, 'localhost', done));
  port = (server.address() as AddressInfo).port;
  localPort = (localServer.address() as AddressInfo).port;
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  await new Promise<void>((done) => localServer.close(() => done()));
});
beforeEach(async () => {
  hits = [];
  await resetStack();
});
afterEach(() => {
  config.avatarImportAllowedHosts = allowedHosts;
});

async function session(...defects: string[]): Promise<string> {
  const id = (await request(app).post('/test/sessions').expect(201)).body.id;
  if (defects.length) await request(app).post('/test/bugs').set('X-Test-Session', id).send({ enable: defects }).expect(200);
  return id;
}

async function importAvatar(sessionId: string, url: string, token?: string) {
  const user = token
    ? { token }
    : { token: (await request(app).post('/test/users').set('X-Test-Session', sessionId).send({ role: 'customer' })).body.accessToken };
  return request(app)
    .post('/api/v1/users/me/avatar/import')
    .set('X-Test-Session', sessionId)
    .set('Authorization', `Bearer ${user.token}`)
    .send({ url });
}

describe('PLS-9.5 importing an avatar from a URL', () => {
  const local = (path: string) => `http://localhost:${localPort}${path}`;

  it('imports a PNG from an allowed host and serves it back unchanged', async () => {
    config.avatarImportAllowedHosts = ['localhost'];
    const id = await session();
    const user = (await request(app).post('/test/users').set('X-Test-Session', id).send({ role: 'customer' })).body;
    const res = await importAvatar(id, local('/avatar.png'), user.accessToken).then((r) => {
      expect(r.status).toBe(201);
      return r;
    });
    expect(res.body.data).toMatchObject({ contentType: 'image/png', sizeBytes: PNG.length });
    const served = await request(app).get(res.body.data.avatarUrl).expect(200);
    expect(served.headers['content-type']).toContain('image/png');
    expect(Buffer.from(served.body).equals(PNG)).toBe(true);
  });

  it('imports a JPEG too', async () => {
    config.avatarImportAllowedHosts = ['localhost'];
    expect((await importAvatar(await session(), local('/avatar.jpg'))).body.data.contentType).toBe('image/jpeg');
  });

  it('refuses a text file with a .png name by its contents: 415', async () => {
    config.avatarImportAllowedHosts = ['localhost'];
    const res = await importAvatar(await session(), local('/not-an-image.png'));
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('refuses an image over 2 MB: 413', async () => {
    config.avatarImportAllowedHosts = ['localhost'];
    const res = await importAvatar(await session(), local('/huge.png'));
    expect(res.status).toBe(413);
    expect(res.body.error.message).toBe('File too large');
  });

  it('does not follow a redirect', async () => {
    config.avatarImportAllowedHosts = ['localhost'];
    const res = await importAvatar(await session(), local('/redirect.png'));
    expect(res.status).toBe(422);
    expect(hits).toEqual(['/redirect.png']);
  });

  it.each([
    ['an address that is not found', '/missing.png'],
    ['something that is not a URL', 'not a url'],
    ['a file: address', 'file:///etc/passwd'],
    ['an ftp: address', 'ftp://example.com/me.png'],
  ])('refuses %s with 422 on url', async (_name, target) => {
    config.avatarImportAllowedHosts = ['localhost'];
    const res = await importAvatar(await session(), target.startsWith('/') ? local(target) : target);
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain('url');
  });

  it('needs a login', async () => {
    await request(app)
      .post('/api/v1/users/me/avatar/import')
      .send({ url: local('/avatar.png') })
      .expect(401);
  });
});

describe('PLS-24.10 the import does not reach inside the network', () => {
  const blocked = (id: string, url: string) => importAvatar(id, url);

  it.each([
    ['localhost', () => `http://localhost:${localPort}/avatar.png`],
    ['a loopback address', () => `http://127.0.0.1:${port}/avatar.png`],
    ['a loopback address written as a number', () => `http://2130706433:${port}/avatar.png`],
    ['a short loopback address', () => `http://127.1:${port}/avatar.png`],
    ['0.0.0.0', () => `http://0.0.0.0:${port}/avatar.png`],
    ['the IPv6 loopback address', () => `http://[::1]:${port}/avatar.png`],
    ['an IPv4 address inside an IPv6 one', () => `http://[::ffff:127.0.0.1]:${port}/avatar.png`],
    ['the cloud metadata address', () => 'http://169.254.169.254/latest/meta-data/'],
    ['a 10.x address', () => 'http://10.0.0.5/avatar.png'],
    ['a 172.16.x address', () => 'http://172.16.0.5/avatar.png'],
    ['a 192.168.x address', () => 'http://192.168.1.5/avatar.png'],
  ])('refuses %s with 422 and makes no request', async (_name, target) => {
    const res = await blocked(await session(), target());
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([{ field: 'url', message: 'That address is not allowed' }]);
    expect(hits).toEqual([]);
  });

  it('refuses a name that resolves to an internal address, not only one typed in', async () => {
    // "localhost" is a name, and it points at 127.0.0.1: it is refused after the lookup, before connecting.
    const res = await blocked(await session(), `http://localhost:${localPort}/avatar.png`);
    expect(res.status).toBe(422);
    expect(hits).toEqual([]);
  });

  it('checks the address on every request, even to a host it has just been allowed to reach', async () => {
    config.avatarImportAllowedHosts = ['localhost'];
    const id = await session();
    expect((await blocked(id, `http://localhost:${localPort}/avatar.png`)).status).toBe(201);
    config.avatarImportAllowedHosts = [];
    expect((await blocked(id, `http://localhost:${localPort}/avatar.png`)).status).toBe(422);
  });

  it('only lets an allow-listed name through, not the same address as a number', async () => {
    config.avatarImportAllowedHosts = ['localhost'];
    const id = await session();
    expect((await blocked(id, `http://localhost:${localPort}/avatar.png`)).status).toBe(201);
    expect((await blocked(id, `http://127.0.0.1:${port}/avatar.png`)).status).toBe(422);
  });

  it.each([
    ['localhost', () => `http://localhost:${localPort}/avatar.png`],
    ['a loopback address', () => `http://127.0.0.1:${port}/avatar.png`],
    ['a loopback address written as a number', () => `http://2130706433:${port}/avatar.png`],
  ])('with ssrf-avatar-url on, fetches %s', async (_name, target) => {
    const res = await blocked(await session('ssrf-avatar-url'), target());
    expect(res.status).toBe(201);
    expect(hits).toEqual(['/avatar.png']);
  });

  it('with the defect on, shows what an internal service answered (a 404 here is still a fetch)', async () => {
    await blocked(await session('ssrf-avatar-url'), `http://127.0.0.1:${port}/internal-admin`);
    expect(hits).toEqual(['/internal-admin']);
  });
});

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:10.0.0.1',
    'not an ip',
  ])('blocks %s', (address) => expect(isBlockedAddress(address)).toBe(true));
  it.each(['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '192.169.0.1', '93.184.216.34', '2606:4700:4700::1111'])(
    'allows %s',
    (address) => expect(isBlockedAddress(address)).toBe(false),
  );
});
