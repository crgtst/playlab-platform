import { createHmac } from 'node:crypto';

const base64url = (value: object | Buffer) => Buffer.from(Buffer.isBuffer(value) ? value : JSON.stringify(value)).toString('base64url');

/** The claims of a real access token, so a forged one differs from it only in how it is signed or what role it claims. */
export function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

/** A token signed with nothing (`alg: none`) or with a secret of the caller's choosing. */
export function forge(claims: Record<string, unknown>, alg: 'none' | 'HS256', secret = ''): string {
  const unsigned = `${base64url({ alg, typ: 'JWT' })}.${base64url(claims)}`;
  return alg === 'none' ? `${unsigned}.` : `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
