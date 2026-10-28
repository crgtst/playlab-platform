# Contract testing exercises

The contract is the OpenAPI file, `app/api/openapi/openapi.yaml`.

## Beginner

1. **Lint it** (PLS-26.1). Run Spectral on the OpenAPI file. Add one rule of your own (for example, every operation needs an
   `operationId`) and make it fail on purpose.
2. **Read a diff** (PLS-26.2). Rename `priceCents` in the product response schema, run `oasdiff` against the version on `main`,
   and explain each breaking change it reports.

## Intermediate

3. **Fuzz it** (PLS-26.3). Run Schemathesis against the running API as a customer and as an admin. Explain every failure: is
   it a defect in the API, or in the contract?
4. **Consumer contract** (PLS-26.4). Write one more Pact interaction in the web app's consumer tests, and replay it against
   the provider using a provider state (PLS-26.5).

## Advanced

5. **Two gates, one change.** Make a change the OpenAPI diff allows but Pact catches, and the other way round. Say which kind
   of change each gate is good at.
6. **Methods and ids** (PLS-26.6, PLS-26.7). Check every route answers an unlisted method with 405 and an `Allow` header, and an
   id above 2147483647 with 404. Find a route that does not.
