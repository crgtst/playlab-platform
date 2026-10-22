import { config } from '../config';
import { sessionScoped } from './testSessions';

/**
 * Bug mode: named defects that tests can switch on with POST /test/bugs to prove the suite catches them.
 * Each one changes only its own behaviour. They are always off unless TEST_HOOKS=true.
 */
export const BUGS = {
  'discount-not-applied': { ac: 'PLS-5.1', side: 'api', description: 'A valid code shows as applied but the total is unchanged' },
  'expired-discount-accepted': { ac: 'PLS-5.2', side: 'api', description: 'An expired code is applied with no error' },
  'discount-stacking': { ac: 'PLS-5.4', side: 'api', description: 'Two discount codes can be applied together' },
  'discount-survives-cart-change': { ac: 'PLS-5.5', side: 'api', description: 'Dropping below the minimum spend keeps the discount' },
  'discount-negative-total': { ac: 'PLS-5.6', side: 'api', description: 'A fixed code larger than the cart gives a negative total' },
  'single-use-reused': { ac: 'PLS-5.3, PLS-24.9', side: 'api', description: 'A one-time code works a second time' },
  'discount-case-sensitive': { ac: 'PLS-5.7', side: 'api', description: 'SAVE10 works but save10 is rejected' },
  'vat-before-discount': { ac: 'PLS-5.8', side: 'api', description: 'VAT is calculated on the pre-discount price' },
  'cart-total-rounding': { ac: 'PLS-4.4', side: 'api', description: 'The subtotal is one cent off with three or more items' },
  'currency-switch-stale': { ac: 'PLS-4.6', side: 'web', description: 'Switching EUR to GBP leaves the cart in EUR' },
  'price-tamper': { ac: 'PLS-6.7', side: 'api', description: 'POST /orders uses prices sent by the client' },
  'quantity-negative': { ac: 'PLS-4.2', side: 'api+web', description: 'A quantity of 0 or -1 is accepted' },
  'stock-oversell': { ac: 'PLS-4.3, PLS-21.4', side: 'api', description: 'You can order more than is in stock' },
  'double-submit': { ac: 'PLS-6.4', side: 'api+web', description: 'Paying once can create two orders' },
  'order-leak': { ac: 'PLS-7.2, PLS-24.1', side: 'api', description: "A customer can read another customer's order by id" },
  'logout-incomplete': { ac: 'PLS-1.4', side: 'api+web', description: 'After logout, the back button still shows the account page' },
  'token-never-expires': { ac: 'PLS-1.5, PLS-24.2', side: 'api', description: 'Expired access tokens are still accepted' },
  'search-apostrophe': { ac: 'PLS-3.2', side: 'api', description: "Searching for O'Neill returns a 500" },
  'pagination-duplicate': { ac: 'PLS-3.5', side: 'api', description: 'The last item on page 1 repeats at the top of page 2' },
  'fada-rejected': { ac: 'PLS-2.3', side: 'api', description: 'Registration rejects names with accents such as Seán' },
  'timezone-off-by-one': { ac: 'PLS-7.3', side: 'web', description: 'Order dates late in the evening show as the next day' },
  'upload-extension-only': {
    ac: 'PLS-9.3',
    side: 'api',
    description: 'A renamed .exe passes as a .png because only the extension is checked',
  },
  'button-moves': { ac: 'PLS-6.8', side: 'payment frame', description: 'The Pay button shifts position after 500 ms' },
  'missing-label': { ac: 'PLS-2.6, PLS-11.1', side: 'web', description: 'The email field loses its accessible label' },
  'stale-stock': { ac: 'PLS-8.6', side: 'api', description: 'The SSE stock counter stops updating' },
  'wrong-status-code': { ac: 'PLS-2.4, PLS-10.2', side: 'api', description: 'A validation error returns 500 instead of 422' },
  // Phase 4: browser APIs
  'geolocation-ignored': {
    ac: 'PLS-13.1',
    side: 'api',
    description: 'The store finder always shows Dublin stores, whatever the location',
  },
  'permission-denied-crash': {
    ac: 'PLS-13.2',
    side: 'web',
    description: 'Denying location permission leaves a spinner forever instead of a message',
  },
  'clipboard-wrong-value': { ac: 'PLS-15.1', side: 'web', description: '"Copy discount code" copies the previous code' },
  'notification-spam': { ac: 'PLS-14.2', side: 'web', description: 'One status change fires two notifications' },
  'battery-banner-stuck': {
    ac: 'PLS-16.2',
    side: 'web',
    description: 'The low-battery banner stays after charging starts',
  },
  'offline-stale-prices': {
    ac: 'PLS-17.3',
    side: 'service worker',
    description: 'The offline cache keeps showing old prices after going back online',
  },
  'aria-heading-skip': { ac: 'PLS-19.2', side: 'web', description: 'The order summary jumps from h2 to h4' },
} as const;

export type BugName = keyof typeof BUGS;
export const BUG_NAMES = Object.keys(BUGS) as BugName[];

// Each test session switches its own defects on and off; requests with no session use the global set.
const enabled = sessionScoped(() => new Set<BugName>());

export function isBugOn(name: BugName): boolean {
  return config.testHooks && enabled().has(name);
}

export const bugs = {
  enable: (names: BugName[]) => names.forEach((n) => enabled().add(n)),
  disable: (names: BugName[]) => names.forEach((n) => enabled().delete(n)),
  clear: () => enabled().clear(),
  active: (): BugName[] => (config.testHooks ? BUG_NAMES.filter((n) => enabled().has(n)) : []),
  list: () => BUG_NAMES.map((name) => ({ name, enabled: enabled().has(name), ...BUGS[name] })),
};
