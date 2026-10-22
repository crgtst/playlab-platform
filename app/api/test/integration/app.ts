import request from 'supertest';
import { createApp } from '../../src/app';

/** The app with test hooks on (TEST_HOOKS=true in the integration project's env). */
export const app = createApp();

export async function resetStack() {
  await request(app).post('/test/reset').expect(200);
}
