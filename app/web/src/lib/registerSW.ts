/**
 * Registers the offline-catalogue service worker in production builds (what Docker serves).
 * Bug-mode flags that affect the worker are passed in its URL; a different URL re-registers it.
 */
export function registerServiceWorker(bugs: string[]) {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const flags = bugs.filter((b) => b === 'offline-stale-prices');
  const url = flags.length ? `/sw.js?bugs=${flags.join(',')}` : '/sw.js';
  navigator.serviceWorker.register(url, { scope: '/' }).catch(() => undefined);
}
