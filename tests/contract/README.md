# Contract testing

Phase 3.

Planned techniques: Spectral lint of `app/api/openapi/openapi.yaml`, Schemathesis fuzzing against the running API,
an `oasdiff` breaking-change gate on pull requests, and Pact consumer tests in the web app with provider verification
in the API.

Showcase: a pull request that renames a response field fails the `oasdiff` and Pact gates.
