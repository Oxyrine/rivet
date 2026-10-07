# Implementation gate board

The two-person A/B plan supersedes the PDF's four-person staffing assumptions.
Person A owns contract, backend engines, control room, customer portal and verifier.
Person B owns technician PWA, billing adapter, long-form seed history, demo driver and submission.

This is a build board, not a claim that the full product is implemented.

| Gate | Required evidence | Status |
| --- | --- | --- |
| Contract | fixture, hash vectors, schemas, generated OpenAPI | Implemented; cross-language hash tests pass |
| Request → recovery | HTTP test with real balances, exceptions and approved plan | Passing integration test; browser request/assignment/recovery verified |
| Proof | false-closure block, reconciliation, acceptance, signed package, remembered-head verification | Passing HTTP lifecycle and independent verifier tests |
| Field integration | Person B client against exported endpoints | Awaiting Person B |
| Production | Postgres concurrency, restore, phone HTTPS, load results | Unverified |

Validation: 117 backend tests are collected and the 114 in the fast suite pass; Next.js production build and TypeScript pass. Control-room WebSocket connectivity verified. PostgreSQL/Docker and phone checks have not been run.

These implemented gates are the Person A slice, not certification of every Tier 1 requirement. Snapshot locking, inline sealing, bounded recovery enumeration, production authentication, rate/gap controls and large-scale validation still differ from the full specification. Person B integration is required before the complete demo gate can be called green.

Tier 2 remains deferred until Tier 1 is demonstrably green.
