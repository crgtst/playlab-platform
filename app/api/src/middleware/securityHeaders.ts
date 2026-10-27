import { RequestHandler } from 'express';
import { isBugOn } from '../lib/bugs';

// What the browser is told about every API response (PLS-24.11, OWASP API8). The API returns JSON, so it needs nothing
// from a page: no scripts, no frames, no features. The two HTML pages it serves ask for more (below).
const API_CSP = "default-src 'none'; frame-ancestors 'none'";
// The Swagger UI page at /api/docs runs inline scripts and styles. The payment frame (/pay/frame) sets its own policy.
const DOCS_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'";
const NO_FEATURES = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=(), clipboard-write=()';

/** Sets the four security headers. With the missing-security-headers defect on, it sets none. */
export const securityHeaders: RequestHandler = (req, res, next) => {
  if (isBugOn('missing-security-headers')) return next();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', NO_FEATURES);
  res.setHeader('Content-Security-Policy', req.path.startsWith('/api/docs') ? DOCS_CSP : API_CSP);
  next();
};
