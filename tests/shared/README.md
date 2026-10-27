# Shared test data

The data contract every suite reads, so none of them hard-codes an account, product or card. All of it describes the
stack straight after `POST /test/reset`.

| File | Contents |
| --- | --- |
| `accounts.json` | The seeded `customer`, `admin` and `support` accounts: email, password, name and role |
| `products.json` | The 5 categories and 40 products, with the `id` each gets after a reset |
| `cards.json` | Test cards (`success`, `decline`, `timeout`, and `invalid`, which fails the Luhn check) and default expiry, CVC and name |
| `discounts.json` | The seeded codes, and the codes each discount fixture creates |
| `load-model.json` | The load model for k6 and JMeter: the data to generate, the rates and durations, the SLOs. Checked by the API's unit tests against the ACs and the hooks' limits |
| `fixtures.json` | Every fixture for `POST /test/seed`, in order, with what it creates |
| `schemas/` | One JSON Schema (draft-07) per OpenAPI component, for validating responses |

Products made by fixtures (`FX-OOS`, `FX-LOW`) and users made by `POST /test/users` get new IDs each time; read them
from the hook's response.

The card defaults use an expiry of `12/30`. A test that moves the clock past 2030 needs a later one.

## Keeping it in step with the app

These files are checked by the API's unit tests (`app/api/test/shared-contract.test.ts`), so a change to the seed
data fails there first. An integration test (`app/api/test/integration/schemas.int.test.ts`) checks real API
responses against `schemas/`.

`schemas/` is generated from `app/api/openapi/openapi.yaml`; don't edit it by hand. After changing the OpenAPI file:

```bash
cd app/api && npm run export:schemas
```

Schema files refer to each other by file name (`"$ref": "Category.json"`), so load the whole folder, or resolve
references relative to the file. The keywords used mean the same in draft-04, for validators that only read that.
