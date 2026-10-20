function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function int(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
}

export const config = {
  port: int(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://playlab:playlab@localhost:5432/playlab',
  webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
  publicWebUrl: process.env.PUBLIC_WEB_URL ?? 'http://localhost:5173',
  testHooks: bool(process.env.TEST_HOOKS, false),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-access-secret-change-me',
  accessTokenTtlSec: int(process.env.ACCESS_TOKEN_TTL_SEC, 15 * 60),
  refreshTokenTtlSec: int(process.env.REFRESH_TOKEN_TTL_SEC, 7 * 24 * 60 * 60),
  rateLimitPerMin: int(process.env.RATE_LIMIT_PER_MIN, 100),
  paymentTimeoutMs: int(process.env.PAYMENT_TIMEOUT_MS, 5000),
  lockoutThreshold: 5,
  lockoutMinutes: 15,
  resetLinkTtlSec: 60 * 60,
  confirmLinkTtlSec: 24 * 60 * 60,
};
