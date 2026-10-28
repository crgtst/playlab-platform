# Playwright exercises

Start the stack, log in as `customer@playlab.test` / `Password123!`, and use `data-testid` locators.

## Beginner

1. **Log in and out** (PLS-1.1, PLS-1.4). Log in, check the header shows the customer's name, log out, and check the account
   page is no longer reachable. Defect: `logout-incomplete`.
2. **Search** (PLS-3.1). Search for a product by name and check the result count and the first result. Then search for
   `O'Neill` (PLS-3.2). Defect: `search-apostrophe`.
3. **Buy something** (PLS-6.1). Add a product, pay with `4242 4242 4242 4242`, and reach the order confirmation. Cancel the
   order afterwards so the stock goes back.

## Intermediate

4. **Discount codes** (PLS-5.1 to 5.8, 5.10, 5.11). Cover a valid percentage code, a fixed code, an expired code
   (`POST /test/seed` fixture `expired-discount`), two codes together, and a code below its minimum spend. Check the grand
   total to the cent: discounted subtotal, VAT, then delivery. Defects: `discount-not-applied`, `expired-discount-accepted`,
   `discount-stacking`, `vat-before-discount`.
5. **Declined and timed-out payments** (PLS-6.2, PLS-6.3). The payment form is in a cross-origin iframe, so use
   `frameLocator`. Check no order is created and the cart is kept. For the timeout card, do not use a fixed sleep.
6. **Live updates** (PLS-7.4, PLS-8.2). Open an order in one browser context, change its status as an admin in another, and
   check the customer sees it without reloading. Defect: `stale-stock` for the live stock counter (PLS-8.6).
7. **Accessibility** (PLS-11.1, PLS-19.2). Run axe on the home, product, cart and checkout pages in both themes, and check
   heading levels. Defects: `missing-label`, `aria-heading-skip`.

## Advanced

8. **Test isolation.** Make every test independent: its own test session (defects, clock) and its own user. Run the suite with
   many workers and with a defect on in one session only; the other workers must not notice.
9. **Browser capabilities** (PLS-13 to 18). Mock geolocation, the clipboard, notifications and the Battery API, and use the real
   service worker to test the offline catalogue. Defects: `geolocation-ignored`, `permission-denied-crash`, `clipboard-wrong-value`,
   `notification-spam`, `battery-banner-stuck`, `offline-stale-prices`.
10. **Time.** Test the 15-minute login lockout and the one-hour password-reset expiry by moving the server clock
    (`POST /test/clock`), not by waiting (PLS-1.3, PLS-2.5). Then do the same for a date that shows wrongly late in the evening
    (PLS-7.3, defect `timezone-off-by-one`).
11. **Flake hunt.** Run your suite 20 times in parallel. Find the tests that fail sometimes, say why (shared data, a race, a
    fixed wait), and fix the cause, not the symptom.
