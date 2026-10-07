# Rivet

Working Person A implementation of the industrial service lifecycle in Product Spec 10 and the supplied two-person implementation plan. This repository includes the shared contract, FastAPI backend, control room, customer portal, site gate and independent verifier.

## Run locally

Python 3.12 and Node.js 22+ are recommended. From the repository root:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r api/requirements.txt
cd web
npm ci
cd ..
./scripts/run-local.ps1 api
```

In a second terminal, run `./scripts/run-local.ps1 web`. Open http://localhost:3000/control. Choose **Sign in**, select **coordinator**, click **Request code**, then **Continue**. Demo mode fills the development OTP. The customer portal uses the **supervisor** account; seeded approval PINs are development fixtures only.

The API runs at http://127.0.0.1:8000 and interactive API documentation at `/docs`. Local data persists in `data/local-demo.db`; startup does not reset it. Private evidence and signing keys are excluded from Git. Keep the signing key when keeping the database, because customers pin its public key.

To host the API on Render with Supabase for the database, login and evidence photos, see [docs/hosting.md](docs/hosting.md).

`docker compose up --build` supplies PostgreSQL, API and web services with persistent database, evidence and key volumes. Docker was unavailable on the build machine, so this path is supplied but unverified. These are development configurations, not a production deployment.

## Implemented

- Request validation, scoped OTP/JWT sessions, technician eligibility, atomic time/part/tool reservations and balanced resource journals.
- Persisted dependency traversal, risk explanations, jointly scheduled recovery options, contractor approval restrictions and stale-plan guards.
- Ordered offline command ingestion, duplicate replay protection, signed gate arrival and scoped field shift cache.
- Independent store issuance, private hashed file uploads, checklist/evidence reconciliation, closure blocking, van stock variance and SLA pause accounting.
- Customer acceptance/dispute paths, signed proof packages and independent Python/browser verification using customer-held receipt anchors.
- Control room, customer portal, verifier and QR gate pages. Live WebSocket updates have a polling fallback.

The control-room button creates the seeded M-104 request and opens the assignment drawer. Assign Ravi, report his dropout, then inspect or approve a recovery plan. The fixture's actual dependency graph affects **3 jobs / 8 commitments**; the interface does not substitute the spec's larger narrative count. Travel metrics are total travel across affected assignments.

## Verify

```powershell
./scripts/check.ps1 all
./scripts/check.ps1 thesis
./scripts/check.ps1 openapi
cd web
npm run build
```

Final validation: **33 backend tests passed**, including an HTTP lifecycle from M-104 request through Priya recovery, false closure refusal, corrected reconciliation, acceptance, clean proof verification and customer-anchor rejection of rewritten/re-signed history. Next.js production compilation and TypeScript passed. Browser checks confirmed request creation, reservations, recovery calculations and live event connectivity.

## Person B handoff

Start with [shared contract](contract/README.md), [OpenAPI](contract/openapi.json), [proof API](docs/proof-api.md), [fixture](contract/fixtures/m104.json), [hash vectors](contract/hash_vectors.json) and [integration tests](tests/test_thesis.py). Use those HTTP payloads as the executable reference. The `web/lib/api.ts` helper provides authenticated same-origin requests through the Next proxy.

Person B still owns the technician PWA, billing adapter, extended seed history, demo driver and submission material. The API command/upload seams are available; end-to-end phone camera/GPS/offline behavior and billing delivery have not been verified.

## Remaining engineering gates

Tenant mutations currently serialize a snapshot transaction; PostgreSQL uses a tenant-row lock rather than separate resource balance locks. Event sealing is inline, and recovery search is bounded enumeration rather than the planned SciPy optimizer. Production authentication, command throttling/gap expiry, migration rollout, large-volume scheduling, PostgreSQL concurrency, backup/restore and physical phone HTTPS testing remain outstanding. Uploaded-byte integrity does not establish that a photograph depicts real work; a registered device ID is not hardware attestation. Customer verification requires a separately pinned provider key and retained customer receipts to detect a provider rewriting and re-signing its own history.

See [implementation status](docs/implementation-status.md) for the current acceptance gates. Advanced domain packs and the wider roadmap are not claimed as delivered.
