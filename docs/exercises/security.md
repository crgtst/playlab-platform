# API security exercises

Local stack only (see [SECURITY.md](../../SECURITY.md)). Each exercise has a secure case, which must pass with the defect off, and
an exploit, which must work with it on. Work through the OWASP API Security Top 10 (2023).

## Beginner

1. **Broken object-level authorisation** (PLS-24.1). As one customer, request another customer's order. Defect: `order-leak`.
2. **Security headers** (PLS-24.11). List the headers on a sample of routes, including an error. Defect:
   `missing-security-headers`.
3. **Error bodies** (PLS-24.12). Cause a 500 and check the body shows no stack, SQL or file path. Defect: `verbose-errors`.

## Intermediate

4. **Authentication** (PLS-24.2 to 24.4). Test token expiry, an unsigned token, user enumeration at login and password reset,
   and a `role` sent at registration. Defects: `token-never-expires`, `jwt-alg-none`, `user-enumeration`, `mass-assignment-role`.
5. **Authorisation by function** (PLS-24.8). As a customer, call the admin user-update route. Defect: `bfla-admin-users`.
6. **Data exposure and limits** (PLS-24.5, PLS-24.7). Read your own orders and look for other people's data; ask for
   `limit=100000`. Defects: `excessive-data-exposure`, `no-page-limit`.
7. **Business flow abuse** (PLS-24.9, PLS-24.6). Use a one-time discount twice; rotate `X-Forwarded-For` to dodge the rate
   limit. Defects: `single-use-reused`, `rate-limit-bypass`.

## Advanced

8. **SSRF** (PLS-24.10). The avatar import fetches a URL. Try `localhost`, other containers (`db`, `api`), a private range, a
   redirect and the metadata address `169.254.169.254`. Prove with a counter that the fetch never started. Defect:
   `ssrf-avatar-url`.
9. **Inventory** (PLS-24.13, PLS-24.14). Find the retired API version and the address suggestion that skips validation.
   Defects: `shadow-api-v0`, `trust-address-provider`.
10. **Scan it.** Run the ZAP baseline and API scans from `tests/security/zap`. Decide for each alert: fix, accept with a
    written reason, or false positive.
