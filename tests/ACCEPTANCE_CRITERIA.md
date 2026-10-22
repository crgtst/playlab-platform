# Acceptance criteria

Twenty-nine Jira-ready stories, each with numbered acceptance criteria. PLS-1 to PLS-19 describe the app as built (PLS-13 to PLS-19 cover its Phase 4 browser features). PLS-20 to PLS-29 come from the upgrade plan in [`docs/REVIEW_AND_PLAN.md`](../docs/REVIEW_AND_PLAN.md): each says which phase builds it, and most of their ACs fail until then. Every AC has a unique ID (`PLS-5.2`), so you can link each one to a test case and report coverage as ACs with a passing test ÷ total ACs.

How to use it: create each story in Jira with its ACs in the description, put the AC ID in each Playwright test title (`test('PLS-5.2 expired code is rejected', …)`) or tag (`@PLS-5.2`), and fill the Test ID column as tests are written. The last column shows which bug-mode defect that AC should catch. In the planned stories it can name defects that don't exist yet; they arrive with the same phase.

## PLS-1 Login and session

As a customer, I want to log in and out securely, so that my account and orders are protected.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-1.1 | Given a registered customer, when they log in with valid credentials, then they land on the home page and see their name in the header |  |  |
| PLS-1.2 | Given any user, when they log in with a wrong password, then they see "Email or password is incorrect" and no session cookie is set |  |  |
| PLS-1.3 | Given 5 failed logins in a row, when a 6th is attempted, then the account is locked for 15 minutes and the API returns 423 |  |  |
| PLS-1.4 | Given a logged-in customer, when they log out, then the session cookie is cleared and the back button does not show account pages |  | `logout-incomplete` |
| PLS-1.5 | Given an access token older than 15 minutes, when it is used on the API, then the API returns 401 |  | `token-never-expires` |
| PLS-1.6 | Given a valid refresh token, when `/auth/refresh` is called, then a new access token is returned |  |  |
| PLS-1.7 | Given the session expires mid-checkout, when the user logs in again, then they return to the same checkout step with the cart intact |  |  |

## PLS-2 Registration and password reset

As a new visitor, I want to create an account and recover my password, so that I can buy and track orders.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-2.1 | Given valid details, when a visitor registers, then the API returns 201 and a confirmation email appears in the test mailbox |  |  |
| PLS-2.2 | Given an email already in use, when a visitor registers, then they see "An account with this email already exists" and the API returns 409 |  |  |
| PLS-2.3 | Given a name with accents (Seán, Aoife Ní Bhriain), when submitted, then it is accepted and displayed correctly |  | `fada-rejected` |
| PLS-2.4 | Given a password under 8 characters, when submitted, then an inline error shows and the API returns 422 |  | `wrong-status-code` |
| PLS-2.5 | Given a forgotten password, when a reset is requested, then a reset link appears in the test mailbox and expires after 1 hour |  |  |
| PLS-2.6 | Given the email field, when checked with axe, then it has an accessible label |  | `missing-label` |

## PLS-3 Product search and browse

As a shopper, I want to search, filter and sort products, so that I can find what I want quickly.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-3.1 | Given the catalogue, when a shopper searches for a term, then only matching products are shown with a result count |  |  |
| PLS-3.2 | Given a search term with an apostrophe (O'Neill), when searched, then results load without error |  | `search-apostrophe` |
| PLS-3.3 | Given filters for category and price range, when both are applied, then every result matches both |  |  |
| PLS-3.4 | Given sort by price ascending, when applied, then each price is less than or equal to the next |  |  |
| PLS-3.5 | Given more than 12 results, when paging, then no product appears on two pages and none is skipped |  | `pagination-duplicate` |
| PLS-3.6 | Given no matches, when searched, then an empty state with a "Clear filters" link is shown |  |  |

## PLS-4 Shopping cart

As a shopper, I want to manage items in my cart, so that I buy exactly what I intend.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-4.1 | Given an in-stock product, when added to the cart, then the cart count and subtotal update |  |  |
| PLS-4.2 | Given a cart item, when the quantity is set to 0 or a negative number, then it is rejected and the previous quantity is kept |  | `quantity-negative` |
| PLS-4.3 | Given a product with 3 in stock, when 4 are requested, then the user sees "Only 3 left" and the API returns 409 |  | `stock-oversell` |
| PLS-4.4 | Given three or more items, when the subtotal is shown, then it equals the sum of line totals to the cent |  | `cart-total-rounding` |
| PLS-4.5 | Given a guest cart, when the guest logs in, then the guest cart merges into the account cart without doubling quantities |  |  |
| PLS-4.6 | Given the currency is switched from EUR to GBP, when the cart is viewed, then all prices show in GBP |  | `currency-switch-stale` |
| PLS-4.7 | Given a price changes after an item is added, when the user reaches payment, then they are warned of the new price |  |  |

## PLS-5 Discount codes

As a shopper, I want to apply a discount code, so that I pay the promoted price.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-5.1 | Given a valid 10% code, when applied, then the checkout total drops by 10% of the subtotal and the saving is shown as a line item |  | `discount-not-applied` |
| PLS-5.2 | Given an expired code, when applied, then "This code has expired" is shown and the total does not change |  | `expired-discount-accepted` |
| PLS-5.3 | Given an unknown, not-yet-active or already-used code, when applied, then each shows its own error and the total does not change |  | `single-use-reused` |
| PLS-5.4 | Given one code is applied, when a second is entered, then the second is rejected with "Only one code per order" |  | `discount-stacking` |
| PLS-5.5 | Given a minimum-spend code, when the cart drops below the threshold, then the code is removed with a message |  | `discount-survives-cart-change` |
| PLS-5.6 | Given a fixed-amount code larger than the cart, when applied, then the total is €0.00, never negative |  | `discount-negative-total` |
| PLS-5.7 | Given a code typed in lowercase or with spaces, when applied, then it is accepted |  | `discount-case-sensitive` |
| PLS-5.8 | Given a discount is applied, when VAT is calculated, then VAT is based on the discounted price |  | `vat-before-discount` |
| PLS-5.9 | Given a discounted order is placed, when the confirmation and CSV export are viewed, then both show the code and saving |  |  |

## PLS-6 Checkout and payment

As a shopper, I want a clear checkout and payment, so that I can complete my order with confidence.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-6.1 | Given a cart, when the 3-step checkout is completed with a success test card, then an order confirmation with an order number is shown |  |  |
| PLS-6.2 | Given a decline test card, when payment is submitted, then "Your card was declined" shows, the API returns 402 and the cart is kept |  |  |
| PLS-6.3 | Given a timeout test card, when payment is submitted, then a retry option is shown and no order is created |  |  |
| PLS-6.4 | Given the Pay button, when it is double-clicked, then exactly one order is created |  | `double-submit` |
| PLS-6.5 | Given an order is placed, when the user presses back, then the order is not resubmitted |  |  |
| PLS-6.6 | Given checkout is in progress, when the user navigates away, then a leave-page warning is shown |  |  |
| PLS-6.7 | Given a client sends a modified price to `/orders`, when the order is created, then the stored price is used |  | `price-tamper` |
| PLS-6.8 | Given the checkout page has loaded, when the user clicks the Pay button, then it does not move |  | `button-moves` |
| PLS-6.9 | Given a keyboard-only user, when they check out, then every step can be completed with Tab and Enter |  |  |

## PLS-7 Orders and access control

As a customer, I want to see only my own orders, so that my data stays private.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-7.1 | Given a customer with orders, when they open Order history, then they see only their orders, newest first |  |  |
| PLS-7.2 | Given customer A, when they request customer B's order by id, then the API returns 404 |  | `order-leak` |
| PLS-7.3 | Given an order placed late in the evening, when its date is shown, then it matches the user's local date |  | `timezone-off-by-one` |
| PLS-7.4 | Given an order status changes, when the customer has the order page open, then the status updates without a refresh |  |  |
| PLS-7.5 | Given a customer, when they open an admin URL, then they see a 403 page |  |  |

## PLS-8 Admin order management

As an admin, I want to manage orders and products, so that I can run the shop.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-8.1 | Given the admin orders grid, when filtered by status, then only orders with that status show |  |  |
| PLS-8.2 | Given an order, when its status is edited inline to an allowed next status, then it saves and a WebSocket event is sent; a status that isn't allowed is refused with the reason shown |  |  |
| PLS-8.3 | Given several selected orders, when a bulk status change is applied, then all of them update if every one can make the transition; otherwise none change and the ones that can't are listed |  |  |
| PLS-8.4 | Given an admin, when they create, edit and delete a product, then each change is reflected in the catalogue; an edit made after someone else changed the product returns 412 and the modal says "This product was changed by someone else" |  |  |
| PLS-8.5 | Given a support user, when they try to edit an order, then the controls are disabled and the API returns 403 |  |  |
| PLS-8.6 | Given a product page is open, when stock changes, then the stock counter updates within 5 seconds |  | `stale-stock` |

## PLS-9 Files

As a user, I want to upload an avatar and export orders, so that I can personalise my account and keep records.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-9.1 | Given a PNG or JPG under 2 MB, when uploaded, then it becomes the avatar |  |  |
| PLS-9.2 | Given a file over 2 MB, when uploaded, then "File too large" shows and the API returns 413 |  |  |
| PLS-9.3 | Given a non-image file renamed to .png, when uploaded, then it is rejected and the API returns 415 |  | `upload-extension-only` |
| PLS-9.4 | Given an admin, when they export orders, then a CSV downloads with one row per order and the header row |  |  |

## PLS-10 API standards

As an API consumer, I want consistent, well-behaved endpoints, so that integrations are predictable.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-10.1 | Given any error, when returned, then the body matches `{ error: { code, message, details, correlationId } }` |  |  |
| PLS-10.2 | Given invalid input, when sent, then the API returns 422, never 500 |  | `wrong-status-code` |
| PLS-10.3 | Given 100 requests in a minute, when the 101st is sent, then the API returns 429 with a `Retry-After` header |  |  |
| PLS-10.4 | Given every endpoint, when called, then the response matches the OpenAPI schema |  |  |
| PLS-10.5 | Given the same Idempotency-Key, when `/orders` is posted twice, then one order is created |  |  |
| PLS-10.6 | Given a product read with a matching `If-None-Match`, when requested, then the API returns 304 |  |  |

## PLS-11 Accessibility, security and display

As any user, I want the site to be usable and safe, so that everyone can shop.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-11.1 | Given the home, product, cart and checkout pages, when scanned with axe, then there are no serious or critical violations |  | `missing-label` |
| PLS-11.2 | Given a review containing a script tag, when displayed, then it shows as text and does not run |  |  |
| PLS-11.3 | Given a 500-character name, emoji or right-to-left text, when displayed, then the layout does not break |  |  |
| PLS-11.4 | Given a screen under 768 px wide, when the site loads, then the navigation collapses into a menu button |  |  |
| PLS-11.5 | Given the language is switched to Irish, when pages load, then navigation and checkout text are translated |  |  |
| PLS-11.6 | Given the network goes offline, when the user acts, then a friendly message shows and the page recovers when back online |  |  |

## PLS-12 Test environment

As a tester, I want reliable test hooks, so that every run starts from a known state.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-12.1 | Given `TEST_HOOKS=true`, when `/test/reset` is called, then all data returns to the base seed within 5 seconds |  |  |
| PLS-12.2 | Given `TEST_HOOKS=false`, when any `/test/*` endpoint is called, then it returns 404 |  |  |
| PLS-12.3 | Given a named defect, when switched on through `/test/bugs`, then only that behaviour changes |  |  |
| PLS-12.4 | Given the stack is starting, when `/health` reports ready, then the web app, API and database all respond |  |  |
| PLS-12.5 | Given `app/.env` copied from `.env.example` with non-default `API_PORT` and `WEB_PORT`, when a customer checks out and requests a password reset, then the payment frame loads from the API port and takes payment, and the reset link uses the web port |  |  |

## PLS-13 Store finder (Phase 4)

As a shopper, I want to find stores near me, so that I can collect an order in person.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-13.1 | Given location permission is granted and the user is in Galway, when they select "Find stores near me" on the store finder, then the 3 nearest stores are listed nearest first with distances in km |  | `geolocation-ignored` |
| PLS-13.2 | Given location permission is denied, when they select "Find stores near me", then "Location access was denied. Search by town instead." is shown and the town search still works |  | `permission-denied-crash` |
| PLS-13.3 | Given the user changes location, when they select "Find stores near me" again, then the results update to the new location |  |  |

## PLS-14 Order notifications (Phase 4)

As a customer, I want a browser notification when my order changes, so that I don't have to keep checking.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-14.1 | Given the user has not decided, when they open Order history, then they are offered "Notify me about my orders", and selecting it asks the browser for permission |  |  |
| PLS-14.2 | Given notifications are allowed, when an admin changes the order status, then exactly one notification shows the order number and new status |  | `notification-spam` |
| PLS-14.3 | Given notifications are blocked, when the status changes, then the in-page status still updates and no error is shown |  |  |

## PLS-15 Copy to clipboard (Phase 4)

As a shopper, I want to copy codes and order numbers, so that I can paste them elsewhere without typing.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-15.1 | Given a discount banner, when "Copy code" is clicked, then the clipboard holds that exact code and a "Copied" toast appears |  | `clipboard-wrong-value` |
| PLS-15.2 | Given an order confirmation, when "Copy order number" is clicked, then the clipboard holds the order number |  |  |
| PLS-15.3 | Given clipboard permission is denied, when copy is clicked, then the code is shown selected on screen with "Press Ctrl+C to copy" |  |  |

## PLS-16 Battery-saver banner (Phase 4)

As a mobile shopper, I want the site to go easy on my battery, so that browsing doesn't drain my phone.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-16.1 | Given battery is below 20% and not charging, when the page loads, then "Low battery: animations paused" shows and CSS animations stop |  |  |
| PLS-16.2 | Given the banner is showing, when charging starts, then the banner disappears within 2 seconds |  | `battery-banner-stuck` |
| PLS-16.3 | Given a browser without the Battery API, when the page loads, then no banner shows and no console error is logged |  |  |

## PLS-17 Offline catalogue (Phase 4)

As a shopper on a poor connection, I want to browse products offline, so that a dropped signal doesn't stop me.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-17.1 | Given the catalogue was visited online, when the browser goes offline, then the catalogue still loads with "You're offline: showing saved prices, which may be out of date." |  |  |
| PLS-17.2 | Given the user is offline, when they view the cart, then the checkout button is disabled with "You're offline. You can check out when you're back online.", and it works again once back online |  |  |
| PLS-17.3 | Given the user comes back online, when the catalogue reloads, then current prices are shown |  | `offline-stale-prices` |
| PLS-17.4 | Given service workers are blocked, when the site loads, then it works normally without offline support |  |  |

## PLS-18 Product gallery and touch (Phase 4)

As a mobile shopper, I want to swipe through product images, so that browsing feels natural on my phone.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-18.1 | Given a touch device, when the user swipes left on the gallery, then the next image shows and the position dots update |  |  |
| PLS-18.2 | Given a touch device, when the user taps an image, then the next image shows and the image status moves on by one (for example from "Image 1 of 3" to "Image 2 of 3") |  |  |
| PLS-18.3 | Given a desktop browser, when the gallery loads, then arrow buttons are shown and work with the keyboard |  |  |

## PLS-19 Accessible structure (Phase 4)

As a screen-reader user, I want a predictable page structure, so that I can navigate quickly.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-19.1 | Given the product card, when its accessibility tree is captured, then it matches the approved aria snapshot |  |  |
| PLS-19.2 | Given the order summary, when its headings are read, then no heading level is skipped |  | `aria-heading-skip` |
| PLS-19.3 | Given the site header, when its accessibility tree is captured, then it matches the approved aria snapshot on desktop and mobile |  |  |

## PLS-20 Order lifecycle (Phase 1)

As an admin, I want orders to move only through valid statuses, so that an order's history always makes sense.

Built in Phase 1 ([`docs/REVIEW_AND_PLAN.md`](../docs/REVIEW_AND_PLAN.md), API addition 4).

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-20.1 | Given an order, when an admin moves it one step along `pending → paid → processing → shipped → delivered`, then the API returns 200 with the new status |  |  |
| PLS-20.2 | Given a `delivered` order, when an admin sets it back to `pending`, then the API returns 409 `INVALID_TRANSITION` with `details: { from, to, allowed }` and the order is unchanged |  | `status-any-transition` |
| PLS-20.3 | Given a `shipped` order, when an admin cancels it, then the API returns 409 `INVALID_TRANSITION` |  | `status-any-transition` |
| PLS-20.4 | Given a bulk status change where some selected orders can't make the transition, when it is applied, then no order changes and the 409 lists every order that can't |  | `status-any-transition` |
| PLS-20.5 | Given a `processing` order, when an admin cancels it, then it becomes `cancelled` and each item's stock goes back up by its quantity |  |  |
| PLS-20.6 | Given a customer's own order, when they call `POST /orders/{id}/cancel`, then it is cancelled if it was `pending` or `paid`, and returns 409 `INVALID_TRANSITION` if it was `processing` or later |  |  |

## PLS-21 Concurrency and lost updates (Phase 1)

As an admin, I want to be told when someone else changed a product first, so that I never overwrite their edit unknowingly.

Built in Phase 1 (API addition 5).

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-21.1 | Given product 6's current ETag, when it is updated with `If-Match` set to that ETag, then the API returns 200 and a new ETag |  |  |
| PLS-21.2 | Given an ETag from before another admin's edit, when it is sent in `If-Match`, then the API returns 412 and the product is unchanged |  | `lost-update` |
| PLS-21.3 | Given no `If-Match` header, when `PUT /products/6` is sent, then the API returns 428 |  | `lost-update` |
| PLS-21.4 | Given product `FX-LOW` with stock 1, when 20 customers order it at the same moment, then exactly 1 order succeeds and 19 get 409 |  | `stock-oversell` |
| PLS-21.5 | Given an order, when `PATCH /orders/{id}/status` is sent with a stale `If-Match`, then the API returns 412 and the status is unchanged; without `If-Match` it returns 428 |  | `lost-update` |
| PLS-21.6 | Given an order, when `GET /orders/{id}` is called, then the response has an `ETag`, and the ETag changes when the order's status changes |  |  |
| PLS-21.7 | Given the admin orders grid is open and another admin then changes an order's status, when the first admin edits that order's status, then the grid says the order was changed by someone else and shows its current status |  | `lost-update` |

## PLS-22 Account management (Phase 1)

As a customer, I want to manage and delete my account, so that I stay in control of my data.

Built in Phase 1 (API addition 6).

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-22.1 | Given a logged-in customer, when they change their name with `PATCH /users/me`, then the new name is returned by `GET /users/me` and shown in the header |  |  |
| PLS-22.2 | Given a logged-in customer, when they change their email and give their current password, then they can log in with the new email and not the old one |  |  |
| PLS-22.3 | Given a wrong current password, when they try to change their email, then the API returns 422 on `currentPassword` and the email is unchanged |  |  |
| PLS-22.4 | Given a customer with sessions on two devices, when they delete their account with `DELETE /users/me`, then both refresh tokens stop working and any access token they hold returns 401 |  |  |
| PLS-22.5 | Given a deleted account, when an admin views its orders, then the orders are kept but the customer's name and email are anonymised |  |  |
| PLS-22.6 | Given an email that belongs to another account, when a customer changes their email to it, then the API returns 409 `EMAIL_IN_USE` and the email is unchanged |  |  |

## PLS-23 User administration (Phase 1)

As an admin, I want to find and manage user accounts, so that I can fix access problems.

Built in Phase 1 (API addition 6).

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-23.1 | Given an admin, when they call `GET /admin/users` with `role` and `q` filters, then only matching users are returned, paginated |  |  |
| PLS-23.2 | Given an admin, when they change a user's role with `PATCH /admin/users/{id}`, then the new role applies from that user's next login |  |  |
| PLS-23.3 | Given an account locked after 5 failed logins, when an admin unlocks it, then the user can log in straight away |  |  |
| PLS-23.4 | Given a support user, when they list users, then the list is returned, and when they try to change a user, then the API returns 403 |  |  |
| PLS-23.5 | Given a customer, when they call `GET /admin/users`, then the API returns 403 |  |  |

## PLS-24 API security (planned: Phases 1 and 3)

As the shop's owner, I want the API to resist the OWASP API Security Top 10 (2023), so that customer data and money are safe.

Partly built. Checked on 21 Oct 2026: PLS-24.2, 24.3, 24.4, 24.7, 24.9 and 24.13 already hold, and so does 24.1 for reading and tracking. PLS-24.1 also holds for cancelling since Phase 1 task 5, and PLS-24.8 since task 8. PLS-24.6 fails today (finding A7), and so does 24.11 until security headers are added. The security lab and its defects arrive with Phases 1 and 3 (API addition 7). The OWASP risk is given in brackets.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-24.1 | (API1) Given customer A, when they read, track or cancel customer B's order by id, then the API returns 404 |  | `order-leak` |
| PLS-24.2 | (API2) Given an access token that is unsigned (`alg: none`), signed with another key, or expired, when it is used, then the API returns 401 |  | `jwt-alg-none`, `token-never-expires` |
| PLS-24.3 | (API2) Given a registered email and an unknown one, when each is used for a failed login and for a password-reset request, then the status codes and messages are identical |  | `user-enumeration` |
| PLS-24.4 | (API3) Given a registration body that includes `"role": "admin"`, when the account is created, then it is a customer account |  | `mass-assignment-role` |
| PLS-24.5 | (API3) Given a customer, when they read any of their orders, then the response contains no other customer's data, such as email addresses |  | `excessive-data-exposure` |
| PLS-24.6 | (API4) Given a guest who has used up the rate limit, when they keep sending requests with a different `X-Forwarded-For` header each time, then they still get 429 |  | `rate-limit-bypass` |
| PLS-24.7 | (API4) Given `limit=100000`, when `GET /products` or `GET /orders` is called, then the API returns 422 because the limit is above the documented maximum |  | `no-page-limit` |
| PLS-24.8 | (API5) Given a customer's token, when they call `PATCH /admin/users/{id}`, then the API returns 403 and the user is unchanged |  | `bfla-admin-users` |
| PLS-24.9 | (API6) Given a single-use discount code, when two orders try to use it at the same moment, then only one order gets the discount |  | `single-use-reused` |
| PLS-24.10 | (API7) Given the "import avatar from URL" feature, when the URL points to `localhost`, the `db` container, a private address or `169.254.169.254`, then the API returns 422 and makes no request to it |  | `ssrf-avatar-url` |
| PLS-24.11 | (API8) Given any API or web response, when its headers are read, then it has `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Content-Security-Policy` and `Permissions-Policy` |  | `missing-security-headers` |
| PLS-24.12 | (API8) Given an unexpected server error, when the 500 is returned, then its body has only the standard error fields: no stack trace, SQL or file paths |  | `verbose-errors` |
| PLS-24.13 | (API9) Given the retired API version, when `/api/v0/orders` is called, then the API returns 404 |  | `shadow-api-v0` |
| PLS-24.14 | (API10) Given an address suggestion that breaks the shipping-address rules, such as a 300-character line, when it is selected and the order is placed, then the API validates it like a typed address and returns 422 |  | `trust-address-provider` |

## PLS-25 Observability (Phase 1)

As a tester, I want to trace any request through the logs, so that I can find why it failed without guessing.

Built in Phase 1 (API additions 2 and 3): correlation IDs, logs and metrics.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-25.1 | Given a request with a valid `X-Correlation-Id` (1 to 64 of `A-Z a-z 0-9 - _`), when it is answered, then the same ID is echoed back; without one, or with an invalid one, a new UUID is returned |  |  |
| PLS-25.2 | Given a request's correlation ID, when `GET /test/logs?correlationId=` is called, then it returns that request's log line with time, correlation ID, method, route, status, duration, user ID, test session and active defects |  |  |
| PLS-25.3 | Given a login and a card payment, when their log lines are read, then passwords, the `Authorization` header, cookies and card numbers are redacted |  |  |
| PLS-25.4 | Given traffic has been sent, when `GET /metrics` is scraped, then it returns Prometheus text with a request-duration histogram by route and status, and it is not rate limited |  |  |
| PLS-25.5 | Given an order is placed and a card is declined, when `GET /metrics` is scraped, then the orders-created and payments-declined counters have each gone up by 1, and the active-defects and database-pool gauges are present |  |  |

## PLS-26 Contract and versioning (planned: Phase 3)

As an API consumer, I want the API to keep its published contract, so that my integration doesn't break without warning.

Not built yet: the contract jobs and `POST /test/provider-states` arrive in Phase 3 (API addition 9).

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-26.1 | Given the OpenAPI file, when it is linted with Spectral using the repo's ruleset, then there are no errors |  |  |
| PLS-26.2 | Given the running API, when Schemathesis runs against the OpenAPI file, then every response matches its schema and no request causes a 500 |  |  |
| PLS-26.3 | Given a pull request that changes the OpenAPI file, when `oasdiff` compares it with `main`, then any breaking change to `/api/v1` fails the check |  |  |
| PLS-26.4 | Given the web app's Pact consumer contracts, when they are verified against the API, then every interaction passes |  |  |
| PLS-26.5 | Given a provider-state name such as "product 6 has stock 3", when `POST /test/provider-states` is called with it, then the matching data is set up |  |  |

## PLS-27 Performance and capacity (planned: Phase 3)

As the shop's owner, I want the shop to stay fast under expected load and fail gracefully beyond it, so that busy days don't lose sales.

Not built yet: these run against the `perf` Compose profile with generated data (API addition 8). The figures are starting points; calibrate them on your machine in Phase 3.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-27.1 | Given the perf profile with generated data, when `GET /products` is called at 50 requests per second for 5 minutes, then p95 latency is under 200 ms and errors are under 1% |  |  |
| PLS-27.2 | Given the perf profile with generated data, when `POST /orders` is called at 10 requests per second for 5 minutes, then p95 latency is under 800 ms and errors are under 1% |  |  |
| PLS-27.3 | Given steady load at half the PLS-27.1 rate for 1 hour, when the soak ends, then p95 latency is within 20% of the first 5 minutes and the API stays within its memory limit |  |  |
| PLS-27.4 | Given load well beyond capacity, when the API is overloaded, then it answers with 429 or 503 and `Retry-After` rather than timing out, and recovers within 1 minute of the load dropping |  |  |
| PLS-27.5 | Given `docker compose --profile perf up`, when the stack is ready, then the rate limit is off, the API and database run with their CPU and memory limits, and Grafana shows request rate, p95 latency and error rate |  |  |

## PLS-28 Test environment v2 (planned: Phase 1)

As a tester, I want isolated test sessions and repeatable data, so that parallel runs don't interfere and the app can't be deployed unsafely.

Partly built: test sessions (28.1, 28.2, 28.6 to 28.10) are built. The production guard (28.5) arrives later in Phase 1, and bulk data (28.3, 28.4) with the perf profile in Phase 3.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-28.1 | Given two test sessions, when one switches on a defect, adds a chaos rule or moves the clock, then requests in the other session, and requests with no session, are unaffected |  |  |
| PLS-28.2 | Given no `X-Test-Session` header or cookie, when the test hooks are used, then the global state applies, exactly as before sessions existed |  |  |
| PLS-28.3 | Given a reset, when `POST /test/generate` is called twice with the same body and `seed`, then the data it creates is identical both times |  |  |
| PLS-28.4 | Given `POST /test/users/bulk` with `{ "count": 500 }`, when it returns, then the CSV has 500 rows of email, password and token, and every account can log in |  |  |
| PLS-28.5 | Given `NODE_ENV=production` and `TEST_HOOKS=true`, when the API starts, then it refuses to start with a clear error unless `PLAYLAB_ALLOW_UNSAFE=true` |  |  |
| PLS-28.6 | Given `POST /test/sessions`, when it returns, then the body has the session `id` and a `test_session` cookie is set |  |  |
| PLS-28.7 | Given two test sessions, when one adds a latency rule or uses up its rate limit, then requests in the other session are not slowed down or limited |  |  |
| PLS-28.8 | Given a session idle for longer than the idle timeout (1 hour by default), when it is next sent, then hook calls with it return 404 `TEST_SESSION_NOT_FOUND` and other requests use the global state |  |  |
| PLS-28.9 | Given several test sessions, when `POST /test/reset` is called, then every session is removed and hook calls with their ids return 404 |  |  |
| PLS-28.10 | Given a session with `button-moves` switched on, when that session's checkout opens the payment frame, then the frame shows the defect, and a checkout with no session does not |  |  |

## PLS-29 Delivery pipeline (planned: Phase 3)

As a maintainer, I want every change checked by the same gates, so that a broken build or an uncaught defect never reaches `main`.

Partly built: the quality workflow runs on every pull request. The other gates arrive with their suites.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-29.1 | Given a pull request, when any required gate (quality, functional, API, contract or security) fails, then the pull request can't be merged |  |  |
| PLS-29.2 | Given a push to `main`, when the pipelines finish, then the latest reports are published to GitHub Pages and linked from the README |  |  |
| PLS-29.3 | Given the nightly run, when it switches on defects at random, then each one is caught by at least one test, and the run fails if any is missed |  |  |
| PLS-29.4 | Given a test that names an AC ID that doesn't exist, or a defect that no test catches, when the traceability check runs, then CI fails |  |  |
| PLS-29.5 | Given a pull request, when the quality workflow runs, then the API integration tests run against a fresh Postgres database and must pass |  |  |
