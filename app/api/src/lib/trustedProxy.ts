import dns from 'dns';
import { config } from '../config';
import { isBugOn } from './bugs';

/**
 * Whose X-Forwarded-For the API believes (finding A7). Only the web proxy's: trusting every private address let anyone
 * on the Docker host send a new X-Forwarded-For with each request and never hit the rate limit. The proxy is found by
 * resolving TRUSTED_PROXIES (default: the WEB_URL host) and re-resolving every few seconds, since the web container
 * starts after the API and may change address.
 */
const trusted = new Set<string>();
const REFRESH_MS = 5000;
let started = false;

const normalise = (address: string) => address.replace(/^::ffff:/, '');

async function refresh() {
  const next = new Set<string>();
  for (const host of config.trustedProxies) {
    try {
      for (const { address } of await dns.promises.lookup(host, { all: true })) next.add(normalise(address));
    } catch {
      /* not resolvable yet, for example before the web container starts */
    }
  }
  // Keep the last good answer if nothing resolves for a while.
  if (next.size) {
    trusted.clear();
    next.forEach((a) => trusted.add(a));
  }
}

export const trustedProxies = {
  start() {
    if (started) return;
    started = true;
    void refresh();
    setInterval(() => void refresh(), REFRESH_MS).unref();
  },
  refresh,
};

/** Express's `trust proxy` function. rate-limit-bypass brings back trusting X-Forwarded-For from anyone (PLS-24.6). */
export function trustProxy(address: string): boolean {
  return isBugOn('rate-limit-bypass') || trusted.has(normalise(address));
}
