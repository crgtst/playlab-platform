# API testing exercises (Postman, Karate, REST Assured)

The API is described in OpenAPI at `http://localhost:${API_PORT}/api/openapi.json` and browsable at `/api/docs`. Do each exercise in
one tool, then repeat it in a second to see what changes.

## Beginner

1. **Log in** (PLS-1.1, PLS-1.2). Log in with the seeded customer, extract the access token, and call `GET /users/me` with it.
   A wrong password must return the standard error body (PLS-10.1).
2. **Catalogue** (PLS-3). Check paging: walk every page and check there are no duplicates and nothing is missing. Defect:
   `pagination-duplicate`.
3. **Validation** (PLS-10.2). Send an invalid body to a write endpoint and expect 422 with field details. Defect:
   `wrong-status-code`.

## Intermediate

4. **Data-driven registration** (PLS-2). Drive registration from a table of 20 or more names and emails, including accents
   (`Seán`), apostrophes and very long values. Defect: `fada-rejected`.
5. **Chaining and schemas** (PLS-10.4). Register, log in, add to the cart, order and read the order back, passing values
   between requests. Validate every response against `tests/shared/schemas/`.
6. **Order lifecycle** (PLS-20). Check every allowed and refused status transition, bulk changes that are all-or-nothing, and
   that a cancel puts the stock back. Defect: `status-any-transition`.
7. **Idempotency and caching** (PLS-10.5, PLS-10.6). Send the same `POST /orders` twice with one `Idempotency-Key`. Use
   `If-None-Match` on a product and expect 304.
8. **Prices** (PLS-6.7). Try to order at a price you set yourself. Defect: `price-tamper`.

## Advanced

9. **Concurrency** (PLS-21.4). Twenty customers order the last item at the same moment. Exactly one must succeed. Defect:
   `stock-oversell`.
10. **Optimistic locking** (PLS-21.1 to 21.7). Edit a product with a stale `If-Match`, expect 412, and without it expect 428.
    Defect: `lost-update`.
11. **Forged tokens** (PLS-24.2). Build tokens that are expired, have a changed role, or use `alg: none`. Defects:
    `token-never-expires`, `jwt-alg-none`.
12. **Parallel-safe suites.** Make the suite safe to run in parallel with itself: no test depends on another's data.
