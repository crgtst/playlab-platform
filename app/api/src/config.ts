function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function int(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
}

const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';

export const config = {
  port: int(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://playlab:playlab@localhost:5432/playlab',
  webUrl,
  // Hosts whose X-Forwarded-For is believed: only the web proxy by default (finding A7).
  trustedProxies: (process.env.TRUSTED_PROXIES ?? new URL(webUrl).hostname)
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
  publicWebUrl: process.env.PUBLIC_WEB_URL ?? 'http://localhost:5173',
  testHooks: bool(process.env.TEST_HOOKS, false),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-access-secret-change-me',
  accessTokenTtlSec: int(process.env.ACCESS_TOKEN_TTL_SEC, 15 * 60),
  refreshTokenTtlSec: int(process.env.REFRESH_TOKEN_TTL_SEC, 7 * 24 * 60 * 60),
  rateLimitPerMin: int(process.env.RATE_LIMIT_PER_MIN, 100),
  paymentTimeoutMs: int(process.env.PAYMENT_TIMEOUT_MS, 5000),
  // Level for request logs on stdout: info (default), warn, error or silent. GET /test/logs keeps them either way.
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // A test session unused for this long is forgotten (PLS-28.8).
  testSessionIdleMs: int(process.env.TEST_SESSION_IDLE_MS, 60 * 60 * 1000),
  // The payment iframe is served by the API on its own origin, like a real provider's hosted fields.
  paymentFrameUrl: process.env.PAYMENT_FRAME_URL ?? 'http://localhost:3000/pay/frame',
  // Origins allowed to embed the payment frame and receive its postMessage results.
  shopOrigins: (process.env.SHOP_ORIGINS ?? process.env.PUBLIC_WEB_URL ?? 'http://localhost:5173')
    .split(',')
    .map((o) => new URL(o.trim()).origin),
  lockoutThreshold: 5,
  lockoutMinutes: 15,
  resetLinkTtlSec: 60 * 60,
  confirmLinkTtlSec: 24 * 60 * 60,
};
