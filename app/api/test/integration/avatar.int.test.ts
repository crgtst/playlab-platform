import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, resetStack } from './app';

// Avatar uploads go through multer, so these guard its upgrades as well as the ACs.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const NOT_AN_IMAGE = Buffer.from('MZ this is an executable, not a picture');

let auth: string;

beforeEach(async () => {
  await resetStack();
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'customer@playlab.test', password: 'Password123!' });
  auth = `Bearer ${res.body.accessToken}`;
});

const upload = (file: Buffer, filename: string, field = 'avatar') =>
  request(app).post('/api/v1/users/me/avatar').set('Authorization', auth).attach(field, file, { filename, contentType: 'image/png' });

describe('PLS-9 avatar uploads', () => {
  it('PLS-9.1 accepts a PNG and serves it back', async () => {
    const res = await upload(PNG, 'me.png').expect(201);
    expect(res.body.data).toMatchObject({ contentType: 'image/png', sizeBytes: PNG.length });
    const served = await request(app).get(res.body.data.avatarUrl).expect(200);
    expect(served.headers['content-type']).toBe('image/png');
  });

  it('PLS-9.2 refuses a file over 2 MB with 413', async () => {
    const res = await upload(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), 'big.png').expect(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('PLS-9.3 refuses a non-image renamed to .png with 415', async () => {
    const res = await upload(NOT_AN_IMAGE, 'renamed.png').expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('accepts the renamed file with upload-extension-only on', async () => {
    await request(app)
      .post('/test/bugs')
      .send({ enable: ['upload-extension-only'] })
      .expect(200);
    await upload(NOT_AN_IMAGE, 'renamed.png').expect(201);
  });

  it('needs the file in the "avatar" field', async () => {
    const res = await upload(PNG, 'me.png', 'picture').expect(422);
    expect(res.body.error.details[0].field).toBe('avatar');
  });
});
