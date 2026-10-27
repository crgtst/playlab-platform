Both scans run against the local stack, with the rate limit off. They fail the run only for the rules marked FAIL in
`baseline-rules.tsv` and `api-rules.tsv`; everything else is reported and explained here.

**What fails the run.** In the baseline scan, a missing anti-clickjacking, `X-Content-Type-Options`, Content-Security-Policy or
Permissions-Policy header (a regression of PLS-24.11). In the API scan, SQL injection, reflected or persistent XSS, path traversal,
OS or server-side code injection, SSRF and application error disclosure. All passed.

**What the baseline scan reports, and why it is accepted:**

| Alert | Why it stays |
| --- | --- |
| CSP: `style-src` allows `unsafe-inline` (still a WARN) | React writes inline `style` attributes, which a strict `style-src` blocks. Scripts are `'self'` only, so this does not open script injection. The wildcard `ws:`/`wss:` in `connect-src` that ZAP also reported was removed: `'self'` covers same-origin WebSockets. |
| Cross-Origin-Embedder / Opener / Resource-Policy missing | These isolate a page from other origins. The shop frames a payment page from the API's origin, so a strict policy would break checkout. The lab has no sensitive cross-origin reads to protect. |
| CSP: `script-src` allows `unsafe-inline` (still a WARN) | Only on the Swagger UI page at `/api/docs`, which Swagger UI needs. The shop itself and the API responses do not. |
| CSP: failure to define a directive with no fallback (still a WARN) | One redirect (`/api/docs` to `/api/docs/`) is answered by Express's static file server with its own `default-src 'none'` header. It has no body to attack. |
| Strict-Transport-Security, HTTP only site | The lab runs over plain `http://localhost`; HSTS on HTTP is ignored by browsers, and there is no HTTPS to move to. |
| Suspicious comments, Unix timestamps | Found in the bundled JavaScript and the Swagger UI library (a `TODO` in a router, hash constants that look like dates). Not the shop's data. |
| Non-storable content, "Modern Web Application", localStorage | Informational. `Cache-Control: no-store` on account data is deliberate, the shop is a single-page app, and `localStorage` holds only the language, currency and theme. |

**What the API scan reports, and why it is accepted:**

| Alert | Why it stays |
| --- | --- |
| A client error response code was returned | The scan sends bad input on purpose; 404, 422 and 401 are the right answers. |
| Unexpected Content-Type (`GET /orders/export.csv`) | A false positive: the endpoint returns `text/csv`, which `openapi.yaml` documents. ZAP expects JSON. |
| Cross-Origin-Resource-Policy missing | As above: the API is read by the shop on its own origin, and the payment frame is cross-origin on purpose. |
| Authentication request identified, non-storable content | Informational. |
