# API security testing

Phase 3.

Planned techniques: OWASP API Security Top 10 (2023) test cases, JWT tampering (`alg: none`, wrong key, expired), and
ZAP baseline and API scans driven by `app/api/openapi/openapi.yaml`.

Showcase: one test per OWASP API risk, each with a defect that makes it fail, written up as a security test report.

Only ever run these against your own local stack.
