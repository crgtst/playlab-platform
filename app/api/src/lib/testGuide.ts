import { SEED_PASSWORD, seedDiscounts, seedUsers } from '../db/seed/base';
import { FIXTURES } from '../db/seed/fixtures';
import { bugs } from './bugs';
import { TEST_CARDS } from './payments';

/** What `GET /test` lists. Kept here so the guide and the hook list cannot differ. */
export const TEST_HOOK_LIST = [
  'POST /test/reset',
  'POST /test/sessions',
  'POST /test/seed',
  'POST /test/users',
  'POST /test/users/bulk',
  'POST /test/generate',
  'GET|POST /test/provider-states',
  'GET /test/mailbox/{email}',
  'GET|POST /test/clock',
  'GET|POST|DELETE /test/latency',
  'GET|POST|DELETE /test/chaos',
  'GET|POST|DELETE /test/bugs',
  'GET /test/logs?correlationId=',
  'GET /test/guide',
];

/** One line for each fixture in `POST /test/seed`. The type makes a new fixture without a description a compile error. */
const FIXTURE_DESCRIPTIONS: Record<keyof typeof FIXTURES, string> = {
  'customer-with-orders': 'A new customer with 3 orders (20, 5 and 1 days ago)',
  'orders-for-admin': '2 customers with 12 orders in every status, for the admin screens',
  'customer-with-wishlist': 'A customer with 4 wishlist items in a known order',
  'customer-with-avatar': 'A customer who already has an avatar',
  'product-with-reviews': '3 reviews on product 1, one of them containing a <script> tag',
  'out-of-stock-product': 'Product FX-OOS with stock 0',
  'low-stock-product': 'Product FX-LOW with stock 1',
  'expired-discount': 'EXPIRED10: 10% off, expired yesterday',
  'future-discount': 'FUTURE10: 10% off, starts in 7 days',
  'single-use-discount': 'ONCE15: 15% off, single use, not used yet',
  'used-discount': 'USED10: single use, already used',
  'min-spend-discount': 'MIN50: 10% off when you spend €50',
};

const CARD_RESULTS = {
  success: 'Payment succeeds and the order is created',
  decline: 'Declined: 402 "Your card was declined"; no order, the cart is kept',
  timeout: 'Hangs, then 504; no order, and checkout offers a retry',
} as const;

const SCENARIOS = [
  {
    title: 'An expired discount code',
    ac: 'PLS-5.2',
    steps: [
      'POST /test/seed with {"fixtures":["expired-discount"]}',
      'Add a product to the cart and apply EXPIRED10',
      'Expect "This code has expired"',
    ],
  },
  {
    title: 'A declined or timed-out payment',
    ac: 'PLS-6.2, PLS-6.3',
    steps: ['Add a product and go to payment', 'Pay with the decline card, or the timeout card', 'Expect no order, and the cart kept'],
  },
  {
    title: 'The last item in stock',
    ac: 'PLS-4.3, PLS-21.4',
    steps: [
      'POST /test/seed with {"fixtures":["low-stock-product"]}',
      'Order FX-LOW twice, or from two sessions at once',
      'Expect exactly one order, and a 409 for the other',
    ],
  },
  {
    title: 'A locked account',
    ac: 'PLS-1.3',
    steps: [
      'Log in 5 times with a wrong password',
      'The 6th attempt returns 423',
      'POST /test/clock with {"advanceMs":960000} and log in again',
    ],
  },
  {
    title: 'A password reset',
    ac: 'PLS-2.5',
    steps: [
      'Request a reset on the Forgot password page',
      'Open the Test mailbox for that email and follow the link',
      'It expires after 1 hour: advance the clock to check',
    ],
  },
  {
    title: 'An order moving through its lifecycle',
    ac: 'PLS-20.1 to 20.6',
    steps: [
      'Log in as the admin and open Admin, Orders',
      'Move an order one step: paid, processing, shipped, delivered',
      'Try to move it backwards and expect a refusal',
    ],
  },
  {
    title: 'Catch a defect',
    ac: 'PLS-12.3',
    steps: [
      'Switch one defect on in the list below (or POST /test/bugs)',
      'Repeat the behaviour it breaks',
      'DELETE /test/bugs switches them all off',
    ],
  },
] as const;

/** Everything a tester needs on one page, built from the same constants the app seeds and checks. */
export function testGuide() {
  return {
    accounts: seedUsers.map((u) => ({ ...u, password: SEED_PASSWORD })),
    cards: {
      defaults: { expiry: '12/30', cvc: '123' },
      list: [
        ...(Object.keys(TEST_CARDS) as (keyof typeof TEST_CARDS)[]).map((kind) => ({
          kind,
          number: TEST_CARDS[kind].replace(/(\d{4})(?=\d)/g, '$1 '),
          result: CARD_RESULTS[kind],
        })),
        { kind: 'invalid', number: '4242 4242 4242 4241', result: 'Fails the card number check: 422 "Enter a valid card number"' },
      ],
    },
    discounts: seedDiscounts.map((d) => ({ code: d.code, description: d.description })),
    fixtures: (Object.keys(FIXTURES) as (keyof typeof FIXTURES)[]).map((name) => ({ name, description: FIXTURE_DESCRIPTIONS[name] })),
    scenarios: SCENARIOS.map((s) => ({ ...s, steps: [...s.steps] })),
    links: [
      { label: 'API docs (Swagger)', href: '/api/docs' },
      { label: 'OpenAPI file', href: '/api/openapi.json' },
      { label: 'Test mailbox', href: '/mailbox' },
      { label: 'Admin area', href: '/admin/orders' },
    ],
    hooks: TEST_HOOK_LIST,
    bugs: bugs.list(),
  };
}
