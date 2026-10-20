import type { Currency } from '../api/types';

/**
 * Display settings shared by every formatter. PrefsProvider sets them before rendering
 * (and re-renders the app when they change), so formatters stay plain functions.
 */
const display = {
  locale: 'en-IE',
  currency: 'EUR' as Currency,
  rates: { EUR: 1, GBP: 0.85 } as Record<Currency, number>,
  bugs: new Set<string>(),
};

export function setDisplay(next: Partial<{ locale: string; currency: Currency; rates: Record<Currency, number>; bugs: string[] }>) {
  if (next.locale) display.locale = next.locale;
  if (next.currency) display.currency = next.currency;
  if (next.rates) display.rates = next.rates;
  if (next.bugs) display.bugs = new Set(next.bugs);
}

export function bugOn(name: string): boolean {
  return display.bugs.has(name);
}

export function displayCurrency(): Currency {
  return display.currency;
}

/**
 * Prices are stored in EUR. GBP is a display conversion at a fixed rate, rounded per amount.
 * `currency` forces a currency (used by the currency-switch-stale defect).
 */
export function formatPrice(cents: number, opts: { currency?: Currency } = {}): string {
  const currency = opts.currency ?? display.currency;
  const converted = Math.round(cents * (display.rates[currency] ?? 1));
  return new Intl.NumberFormat(display.locale, { style: 'currency', currency }).format(converted / 100);
}

// timezone-off-by-one: dates are formatted in UTC, so late-evening orders west of UTC show the next day.
const zone = (): { timeZone?: string } => (bugOn('timezone-off-by-one') ? { timeZone: 'UTC' } : {});

/** Dates are shown in the browser's own timezone and the chosen language. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(display.locale, { year: 'numeric', month: 'short', day: 'numeric', ...zone() });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(display.locale, { dateStyle: 'medium', timeStyle: 'short', ...zone() });
}

/** Only allow same-site relative paths as post-login destinations. */
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
