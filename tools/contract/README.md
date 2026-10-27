# Contract checks

Three checks keep the OpenAPI file (`app/api/openapi/openapi.yaml`) honest. They run in the `contract` workflow.

| Check | AC | Run it | What fails |
| --- | --- | --- | --- |
| Spectral lint | PLS-26.1 | `npm run lint:openapi` | A rule in [`.spectral.yaml`](../../.spectral.yaml): every operation has an `operationId` (camelCase) and a summary, paths are kebab-case, and every rate-limited operation documents an error response |
| `oasdiff` | PLS-26.3 | pull requests only | A change that breaks an existing client of `/api/v1`: a removed or renamed response field, a new required request field, a removed path |
| Pact | PLS-26.4 | `npm run test:pact` in `app/web`, then `npm run test:int` in `app/api` | See below |
| Schemathesis | PLS-26.2 | `bash tools/contract/schemathesis.sh` | A response that does not match the file, an undocumented status code, a 500, a wrong `Allow` header |

## Schemathesis locally

Start the stack with the rate limit off, then run the script from the repo root (it needs Docker):

```bash
cd app && RATE_LIMIT_PER_MIN=0 docker compose up --build -d && cd ..
bash tools/contract/schemathesis.sh                  # 25 examples per operation, seed 1: about 5 minutes
MAX_EXAMPLES=100 SEED=7 bash tools/contract/schemathesis.sh
ROLE=admin bash tools/contract/schemathesis.sh       # the admin-only operations (a customer only gets 403)
```

The script signs in as a throwaway user, leaves out `/test`, `/pay`, `/metrics` and `DELETE /users/me`, and turns off the
`positive_data_acceptance` check (a request can match the schema and still break a business rule, so a documented 422 is fine).
[`schemathesis.toml`](schemathesis.toml) accepts any 4xx as a rejection of bad input, because a stale or missing `If-Match` is 412 or 428 by design.
Anything after the script name goes to Schemathesis, for example `--phases fuzzing`. Reports are written to
`tools/contract/results/`. A failure prints the `curl` command that reproduces it. The seed makes a run repeatable; try other
seeds now and then, because each one finds different inputs.

The fixed seed is deliberate: CI gives the same result on every run until the API or the file changes.

## What it found

The first runs found real defects, now fixed (all under PLS-26.2, 26.6 and 26.7):

- A `500` for a huge id (`/users/1307674368000/avatar`, `/orders/55146753715`): ids above 2147483647 are now a 404.
- A `500` for a null character (`?q=%00`) in a query string or JSON body, or for a number beyond a 32-bit integer in a body (`{"productId": 53287031635}`): now a 422.
- A `500` for `{"refreshToken": {}}`: now a 401, because a token that is not a string counts as missing.
- A `500` for a malformed multipart upload and for `DELETE /wishlist/items/0.5`: now a 400 and a 404.
- `TRACE`, `GET /orders/bulk-status` and the like returned 404 or 401: now 405 with an `Allow` header, and `OPTIONS` lists exactly the methods in the file.
- 26 responses the API sent but the file did not document (400 for bad JSON, 401, 422), and a wrong schema for the stock stream.

## `oasdiff` in a pull request

Rename `priceCents` to `price` in the file and the check fails:

```
error [response-required-property-removed] in API GET /products
    removed the required property `data/items/priceCents` from the response with the `200` status
error [new-required-request-property] in API POST /products
    added the new required request property `price`
```

## Changing an `operationId`

The REST Assured suite generates its classes from the file, and names the ones for inline responses after the `operationId`
(`GetAdminUsers200Response` comes from `getAdminUsers`). Renaming an `operationId` renames those classes, so the suite stops
compiling until its references are updated. Rebuild with `./mvnw -pl rest-assured clean test-compile` to see it; an incremental
build can keep stale generated classes and hide the break.

## Pact (PLS-26.4)

The web app is the consumer and the API the provider. Contracts are files in the repo, not a broker.

- **Consumer** (`app/web/pact/web-api.pact.test.ts`): 11 interactions, each run through the web app's own `api()` helper against a Pact
  mock server: products (list, one in stock, one sold out, a 404), categories, config, login (success, wrong password, empty form
  with field errors), and the cart (empty, add an item). Ids, dates and tokens are matched by type; the values the app branches on
  (`stock`, `inStock`, error codes) are exact. `npm run test:pact` writes `app/web/pacts/playlab-web-playlab-api.json`; commit it.
- **Provider** (`app/api/test/integration/pact.int.test.ts`, part of `npm run test:int`): starts the API and replays every
  interaction. Each `given("...")` is set up by calling `POST /test/provider-states`, and the contract's placeholder
  `Authorization` header is swapped for a real token of a new user.
- **In CI**: the `pact-consumer` job fails if the committed pact is out of date, and the API integration job fails if the API
  breaks it. Rename `priceCents` in the product response and the provider test fails on the two interactions that read a product
  (the `oasdiff` gate fails on the same change).

To add a contract: write the interaction, run `npm run test:pact`, and if it names a provider state that does not exist, add it to
`app/api/src/db/seed/providerStates.ts`.
