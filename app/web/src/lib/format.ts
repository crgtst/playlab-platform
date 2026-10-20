const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

export function formatPrice(cents: number): string {
  return euro.format(cents / 100);
}

/** Order dates are shown in the browser's own timezone. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IE', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Only allow same-site relative paths as post-login destinations. */
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
