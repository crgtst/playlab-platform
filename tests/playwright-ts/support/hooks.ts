import { APIRequestContext, expect } from '@playwright/test';
import { API_URL } from './env';

export interface TestUser {
  id: number;
  email: string;
  name: string;
  role: 'customer' | 'admin' | 'support';
  password: string;
}

export interface MailboxMessage {
  id: number;
  to: string;
  type: string;
  subject: string;
  body: string;
  link: string | null;
  createdAt: string;
}

/**
 * The API's test hooks (/test/*). Calls go through the test's request context, which carries its X-Test-Session
 * header, so a clock change or defect affects only this test (see fixtures.ts).
 */
export class TestHooks {
  constructor(private readonly request: APIRequestContext) {}

  /** A new session: its own defects, clock, latency and chaos rules. Returns its id. */
  async startSession(): Promise<string> {
    const res = await this.request.post(`${API_URL}/test/sessions`);
    expect(res.status(), 'POST /test/sessions (is the stack running with TEST_HOOKS=true?)').toBe(201);
    return (await res.json()).id;
  }

  /** A throwaway user, so tests running in parallel never share a cart, wishlist or orders. */
  async createUser(role: TestUser['role'] = 'customer'): Promise<TestUser> {
    const res = await this.request.post(`${API_URL}/test/users`, { data: { role } });
    expect(res.status(), 'POST /test/users').toBe(201);
    const body = await res.json();
    return { ...body.user, password: body.password };
  }

  /** Moves this session's clock forward. */
  async advanceClock(ms: number): Promise<void> {
    const res = await this.request.post(`${API_URL}/test/clock`, { data: { advanceMs: ms } });
    expect(res.status(), 'POST /test/clock').toBe(200);
  }

  async mailbox(email: string): Promise<MailboxMessage[]> {
    const res = await this.request.get(`${API_URL}/test/mailbox/${encodeURIComponent(email)}`);
    expect(res.status(), `GET /test/mailbox/${email}`).toBe(200);
    const body = (await res.json()) as { data: MailboxMessage[] };
    return body.data;
  }
}
