import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The browser only ever talks to the web origin; /api and /test are proxied to the API container,
// so cookies are first-party and no CORS is needed.
const target = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
const proxy = {
  '/api': { target, changeOrigin: true, xfwd: true },
  '/test': { target, changeOrigin: true, xfwd: true },
  // Live order status (WebSocket upgrade is proxied too).
  '/ws': { target, changeOrigin: true, ws: true },
};

// Vite only answers requests for hosts it knows (DNS-rebinding protection). The API's readiness check calls this app
// as http://web:5173 inside Compose, so the service name must be allowed as well as localhost. WEB_ALLOWED_HOSTS adds more,
// for example host.docker.internal when an OWASP ZAP container scans the app (tests/security/zap/run-zap.sh).
const allowedHosts = [
  'web',
  ...(process.env.WEB_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
];

// Security headers on every web response (PLS-24.11). The page loads its own scripts and styles only, talks to its own
// origin (the API is proxied) and over WebSocket, and frames the payment page on the API's origin.
const paymentFrameOrigin = new URL(process.env.PAYMENT_FRAME_URL ?? 'http://localhost:3000/pay/frame').origin;
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // The shop uses geolocation (store finder) and the clipboard (copy buttons); nothing else.
  'Permissions-Policy': 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self), clipboard-read=(self), clipboard-write=(self)',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // 'self' also covers WebSockets to the same host, which is how live order status connects. A bare ws: would allow any host.
    "connect-src 'self'",
    "worker-src 'self'",
    `frame-src 'self' ${paymentFrameOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true, strictPort: true, allowedHosts, proxy, headers },
  preview: { port: 5173, host: true, strictPort: true, allowedHosts, proxy, headers },
});
