# Acceptance criteria

Nineteen Jira-ready stories (PLS-13 to PLS-19 cover Phase 4), each with numbered acceptance criteria. Every AC has a unique ID (`PLS-5.2`), so you can link each one to a test case and report coverage as ACs with a passing test ÷ total ACs.

How to use it: create each story in Jira with its ACs in the description, put the AC ID in each Playwright test title (`test('PLS-5.2 expired code is rejected', …)`) or tag (`@PLS-5.2`), and fill the Test ID column as tests are written. The last column shows which bug-mode defect that AC should catch.

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
| PLS-8.2 | Given an order, when its status is edited inline, then it saves and a WebSocket event is sent |  |  |
| PLS-8.3 | Given several selected orders, when a bulk status change is applied, then all selected orders update |  |  |
| PLS-8.4 | Given an admin, when they create, edit and delete a product, then each change is reflected in the catalogue |  |  |
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
| PLS-10.1 | Given any error, when returned, then the body matches `{ error: { code, message, details } }` |  |  |
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

## PLS-13 Store finder (Phase 4)

As a shopper, I want to find stores near me, so that I can collect an order in person.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-13.1 | Given location permission is granted and the user is in Galway, when they open the store finder, then the 3 nearest stores are listed nearest first with distances in km |  | `geolocation-ignored` |
| PLS-13.2 | Given location permission is denied, when they open the store finder, then "Location is off. Enter a town or Eircode" is shown with a search box |  | `permission-denied-crash` |
| PLS-13.3 | Given the user changes location, when they refresh the list, then the results update to the new location |  |  |

## PLS-14 Order notifications (Phase 4)

As a customer, I want a browser notification when my order changes, so that I don't have to keep checking.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-14.1 | Given the user has not decided, when they open Order history, then they are asked to allow notifications |  |  |
| PLS-14.2 | Given notifications are allowed, when an admin changes the order status, then exactly one notification shows the order number and new status |  | `notification-spam` |
| PLS-14.3 | Given notifications are blocked, when the status changes, then the in-page status still updates and no error is shown |  |  |

## PLS-15 Copy to clipboard (Phase 4)

As a shopper, I want to copy codes and order numbers, so that I can paste them elsewhere without typing.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-15.1 | Given a discount banner, when "Copy code" is clicked, then the clipboard holds that exact code and a "Copied" toast appears |  | `clipboard-wrong-value` |
| PLS-15.2 | Given an order confirmation, when "Copy order number" is clicked, then the clipboard holds the order number |  |  |
| PLS-15.3 | Given clipboard permission is denied, when copy is clicked, then the code is selected on screen with "Press Ctrl+C to copy" |  |  |

## PLS-16 Battery-saver banner (Phase 4)

As a mobile shopper, I want the site to go easy on my battery, so that browsing doesn't drain my phone.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-16.1 | Given battery is below 20% and not charging, when the page loads, then "Low battery: animations paused" shows and carousels stop auto-playing |  |  |
| PLS-16.2 | Given the banner is showing, when charging starts, then the banner disappears within 2 seconds |  | `battery-banner-stuck` |
| PLS-16.3 | Given a browser without the Battery API, when the page loads, then no banner shows and no console error is logged |  |  |

## PLS-17 Offline catalogue (Phase 4)

As a shopper on a poor connection, I want to browse products offline, so that a dropped signal doesn't stop me.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-17.1 | Given the catalogue was visited online, when the browser goes offline, then the catalogue still loads with an "Offline: prices may have changed" notice |  |  |
| PLS-17.2 | Given the user is offline, when they try to check out, then checkout is disabled with a clear message |  |  |
| PLS-17.3 | Given the user comes back online, when the catalogue reloads, then current prices are shown |  | `offline-stale-prices` |
| PLS-17.4 | Given service workers are blocked, when the site loads, then it works normally without offline support |  |  |

## PLS-18 Product gallery and touch (Phase 4)

As a mobile shopper, I want to swipe through product images, so that browsing feels natural on my phone.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-18.1 | Given a touch device, when the user swipes left on the gallery, then the next image shows and the position dots update |  |  |
| PLS-18.2 | Given a touch device, when the user taps an image, then it opens full screen |  |  |
| PLS-18.3 | Given a desktop browser, when the gallery loads, then arrow buttons are shown and work with the keyboard |  |  |

## PLS-19 Accessible structure (Phase 4)

As a screen-reader user, I want a predictable page structure, so that I can navigate quickly.

| AC ID | Given / When / Then | Test ID | Defect it catches |
| --- | --- | --- | --- |
| PLS-19.1 | Given the product card, when its accessibility tree is captured, then it matches the approved aria snapshot |  |  |
| PLS-19.2 | Given the order summary, when its headings are read, then no heading level is skipped |  | `aria-heading-skip` |
| PLS-19.3 | Given the site header, when its accessibility tree is captured, then it matches the approved aria snapshot on desktop and mobile |  |  |
