import { APIRequestContext, expect } from '@playwright/test';
import { API_URL } from './env';

export interface TestUser {
  id: number;
  email: string;
  name: string;
  role: 'customer' | 'admin' | 'support';
  password: string;
  accessToken: string;
}

/** The API's test hooks (/test/*). Calls carry the test's X-Test-Session header, so a defect or clock change stays in the test. */
export class TestHooks {
  constructor(private readonly request: APIRequestContext) {}

  async startSession(): Promise<string> {
    const res = await this.request.post(`${API_URL}/test/sessions`);
    expect(res.status(), 'POST /test/sessions (is the stack running with TEST_HOOKS=true?)').toBe(201);
    return (await res.json()).id;
  }

  /** A throwaway user, so tests running in parallel never share a cart or orders. */
  async createUser(role: TestUser['role'] = 'customer', name?: string): Promise<TestUser> {
    const res = await this.request.post(`${API_URL}/test/users`, { data: { role, name } });
    expect(res.status(), 'POST /test/users').toBe(201);
    const body = await res.json();
    return { ...body.user, password: body.password, accessToken: body.accessToken };
  }

  async advanceClock(ms: number): Promise<void> {
    const res = await this.request.post(`${API_URL}/test/clock`, { data: { advanceMs: ms } });
    expect(res.status(), 'POST /test/clock').toBe(200);
  }

  /** Switches defects on for this test's session only. */
  async enableDefects(...names: string[]): Promise<void> {
    if (!names.length) return;
    const res = await this.request.post(`${API_URL}/test/bugs`, { data: { enable: names } });
    expect(res.status(), `Switch on ${names.join(', ')} (is the name right?)`).toBe(200);
  }
}
