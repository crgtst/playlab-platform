# Defect key

> [!CAUTION]
> **Spoilers.** This lists every planted defect and where it is. Try to find them yourself first: switch a defect on with
> `POST /test/bugs`, run your tests, and see which fail. If none fail, your suite has a gap.

47 defects. Switch one on with:

```bash
curl -X POST localhost:${API_PORT}/test/bugs -H 'Content-Type: application/json' -d '{"enable":["order-leak"]}'
```

For one test session only, send that session’s `X-Test-Session` header. Turn them all off with `DELETE /test/bugs`.

| Defect | Breaks | Where | What you will see |
| --- | --- | --- | --- |
| `discount-not-applied` | PLS-5.1, PLS-5.10, PLS-5.11 | api | A valid code shows as applied but the total is unchanged |
| `expired-discount-accepted` | PLS-5.2 | api | An expired code is applied with no error |
| `discount-stacking` | PLS-5.4 | api | Two discount codes can be applied together |
| `discount-survives-cart-change` | PLS-5.5 | api | Dropping below the minimum spend keeps the discount |
| `discount-negative-total` | PLS-5.6 | api | A fixed code larger than the cart gives a negative total |
| `single-use-reused` | PLS-5.3, PLS-24.9 | api | A one-time code works a second time |
| `discount-case-sensitive` | PLS-5.7 | api | SAVE10 works but save10 is rejected |
| `vat-before-discount` | PLS-5.8 | api | VAT is calculated on the pre-discount price |
| `cart-total-rounding` | PLS-4.4 | api | The subtotal is one cent off with three or more items |
| `currency-switch-stale` | PLS-4.6 | web | Switching EUR to GBP leaves the cart in EUR |
| `price-tamper` | PLS-6.7 | api | POST /orders uses prices sent by the client |
| `quantity-negative` | PLS-4.2 | api+web | A quantity of 0 or -1 is accepted |
| `stock-oversell` | PLS-4.3, PLS-21.4 | api | You can order more than is in stock |
| `double-submit` | PLS-6.4 | api+web | Paying once can create two orders |
| `order-leak` | PLS-7.2, PLS-24.1 | api | A customer can read another customer's order by id |
| `logout-incomplete` | PLS-1.4 | api+web | After logout, the back button still shows the account page |
| `token-never-expires` | PLS-1.5, PLS-24.2 | api | Expired access tokens are still accepted |
| `search-apostrophe` | PLS-3.2 | api | Searching for O'Neill returns a 500 |
| `pagination-duplicate` | PLS-3.5 | api | The last item on page 1 repeats at the top of page 2 |
| `fada-rejected` | PLS-2.3 | api | Registration rejects names with accents such as Seán |
| `timezone-off-by-one` | PLS-7.3 | web | Order dates late in the evening show as the next day |
| `upload-extension-only` | PLS-9.3 | api | A renamed .exe passes as a .png because only the extension is checked |
| `button-moves` | PLS-6.8 | payment frame | The Pay button shifts position after 500 ms |
| `missing-label` | PLS-2.6, PLS-11.1 | web | The email field loses its accessible label |
| `stale-stock` | PLS-8.6 | api | The SSE stock counter stops updating |
| `rate-limit-bypass` | PLS-24.6 | api | X-Forwarded-For is trusted from anyone, so a client can rotate it to dodge the rate limit |
| `lost-update` | PLS-21.2, PLS-21.3, PLS-21.5, PLS-21.7 | api | If-Match is ignored, so a stale edit silently overwrites a newer one |
| `status-any-transition` | PLS-20.2, PLS-20.3, PLS-20.4 | api | An admin can move an order to any status, such as delivered back to pending |
| `wrong-status-code` | PLS-2.4, PLS-10.2 | api | A validation error returns 500 instead of 422 |
| `geolocation-ignored` | PLS-13.1 | api | The store finder always shows Dublin stores, whatever the location |
| `permission-denied-crash` | PLS-13.2 | web | Denying location permission leaves a spinner forever instead of a message |
| `clipboard-wrong-value` | PLS-15.1 | web | "Copy discount code" copies the previous code |
| `notification-spam` | PLS-14.2 | web | One status change fires two notifications |
| `battery-banner-stuck` | PLS-16.2 | web | The low-battery banner stays after charging starts |
| `offline-stale-prices` | PLS-17.3 | service worker | The offline cache keeps showing old prices after going back online |
| `missing-security-headers` | PLS-24.11 | api | API responses carry none of the security headers |
| `verbose-errors` | PLS-24.12 | api | An unexpected 500 includes the stack trace, the SQL and file paths |
| `jwt-alg-none` | PLS-24.2 | api | A token with "alg": "none" is accepted without a signature |
| `user-enumeration` | PLS-24.3 | api | Login and password reset say whether an email has an account |
| `mass-assignment-role` | PLS-24.4 | api | A "role" in the registration body is honoured, so anyone can register as an admin |
| `bfla-admin-users` | PLS-24.8 | api | Any logged-in user can change any other user through PATCH /admin/users/{id} |
| `excessive-data-exposure` | PLS-24.5 | api | A customer's orders also show other customers' names and emails |
| `no-page-limit` | PLS-24.7 | api | The list limit has no maximum: limit=100000 returns everything |
| `shadow-api-v0` | PLS-24.13 | api | The retired /api/v0/orders route is still on: no login, every order and email |
| `trust-address-provider` | PLS-24.14 | api | An address picked from the suggestions skips the shipping-address rules |
| `ssrf-avatar-url` | PLS-24.10 | api | The avatar import fetches any address, including localhost, other containers and the cloud metadata address |
| `aria-heading-skip` | PLS-19.2 | web | The order summary jumps from h2 to h4 |

The tests that catch each one, and the last result, are in [`docs/traceability.md`](../traceability.md) (defect matrix).
