# Integration brief for the field app, billing adapter and demo (Person B)

This describes the backend as it actually works today, which differs from the original plan in a few places.
`tests/test_thesis.py` is the executable reference for the whole M-104 story: copy its HTTP sequence.

## Where things run

| | Address |
| --- | --- |
| Web (live) | https://rivet-lyart.vercel.app |
| API (live) | https://rivet-1.onrender.com (free plan, kept awake by a monitor) |
| Local | `rivet-api` on 127.0.0.1:8000 (`ENV=demo`), web with `NEXT_PUBLIC_AUTH_MODE=demo` |

Run local, from the repo root (PowerShell): `$env:ENV='demo'; $env:DATABASE_URL='sqlite:///data/local-demo.db'; .venv/Scripts/python.exe -m uvicorn api.app.main:app --port 8000`, then `npm run dev` in `web/` with `$env:NEXT_PUBLIC_AUTH_MODE='demo'`. Setting `DATABASE_URL` matters: it is the database `scripts/bake_fixture.py` reads by default. Tests: `python -m pytest tests`, `npm run typecheck && npm run build` in `web/`.

## Signing in

- **Local demo:** `POST /auth/token {"user_id": "priya", "otp": "246810"}` returns `access_token` (15 minutes) and `refresh_token`; `POST /auth/refresh {"refresh_token"}` renews it.
- **Technicians:** `ravi, priya, karthik, arjun, meena, dev, contractor-1`. Each has `device-<name>` as its device id. A technician may only call `/devices/<their own device>/...`.
- **Live server:** only Supabase sign-ins work. In the browser, **always call the API through `api()` in `web/lib/api.ts`**. It attaches the current Supabase token and refreshes it. Do not write your own `fetch` with a stored token: Supabase tokens last an hour, and a phone that was offline for hours needs a refreshed token before it replays its queue.
- Roles are not in the token. The API maps the signed-in email to a person (Team access page, admin only).

## Field endpoints (all under the technician's own device)

- `GET /devices/{device}/shift-cache` returns `{cached_at, jobs, commitments, last_seq}`.
- `POST /devices/{device}/commands` takes `{"commands": [...]}`, **at most 10 per request** (the rest come back `deferred`; send them again). Each command:
  `{idempotency_key, device_seq, device_ts, type, job_id, payload}`
  - `device_seq` starts at `last_seq + 1` and has no gaps. `device_ts` is ISO with a timezone.
  - Per-command result `status`: `accepted`, `duplicate` (already applied, nothing happens), `rejected` (with `code`), `held_gap` (an earlier sequence number is missing), `deferred` (just resend). The response also has `last_seq` and `sequence_gaps`.
- Types and payloads:
  - `CheckIn`: `{arrival_code: {window, signature}, gps: {lat_e6, lng_e6}, machine_qr}`. Latitude and longitude are integers in millionths of a degree. The gate page's QR holds JSON `{site_id, window, signature}`; pass `window` and `signature`. Codes are valid for the current and previous 30-second window.
  - `StartWork` (rejected with `PERMIT_PENDING` until the supervisor marks the permit fulfilled), `TaskLogged {checklist: [...], ...}`, `ReadingRecorded {...}`, `PartScanned {resource, quantity, source?}`, `EvidenceAttached {photo_id, type}`, `ReportDropout`, `SiteAccessRefused`, `SubmitReport {parts: {HS-40: 1}, checklist: [...], minutes, notes}`, `CheckOut`.
- Rejection codes the conflict screen should handle: `JOB_REASSIGNED` (the job moved; your evidence is kept as pending), `NOT_FOUND`, `JOB_CANCELLED`, `PERMIT_PENDING`, `CHECKIN_REQUIRED`, `PART_CONFLICT`, `INSUFFICIENT_BALANCE`, `ARRIVAL_CODE_EXPIRED`, `DEVICE_TIME_INVALID`, `EVIDENCE_UPLOAD_REQUIRED`, `UNKNOWN_COMMAND`.
- Only the technician a job is currently assigned to, or one it moved away from, may send commands for it. Facts from the previous technician are stored as pending evidence and never change the job.

## Photos

1. `POST /evidence/uploads {photo_id, job_id, type, filename, content_base64}` first. `photo_id` is your own stable id, so retries are safe.
2. Then queue `EvidenceAttached {photo_id, type}`. `type` is one of `before_photo, after_photo, permit_photo, delivery_note, signed_sheet`.
3. The server accepts **PNG, JPEG and PDF only** (10 MB for images, 20 MB for PDFs), checked by content. HEIC is rejected, so convert to JPEG on the phone.
4. Shrink photos to about 1.5 MB before sending, and test an upload through the live site early. Vercel limits request bodies to 4.5 MB, and base64 adds a third.

## Billing adapter

- Enable it with `POST /adapters/billing/enable` (coordinator or manager). Until then the feed is empty.
- Poll `GET /subscriptions/billing/events?after=<tenant_seq>` (coordinator, manager or auditor). Invoice-worthy events are `AcceptanceRecorded` (the payload `acceptance` says Verified and so on) and `AcceptanceDeemed`. There is no `CustomerAccepted` event.
- Run the adapter on the laptop against the live API during the demo. It needs a token, so use the local demo server, or sign in with a Supabase user and pass its token.

## Demo driver and seed history

- `demo.py` drives the scripted clock with `POST /admin/clock {"set": "2026-10-07T09:02:00+05:30"}` (or `{"advance": seconds}`) and resets with `POST /admin/reset`. Both need an **admin** and work locally in demo mode. On the live server they work only when `DEMO_CONTROLS=1` is set. Sign-ins there are Supabase, not the demo OTP.
- **Reset restores the seed, not your API-created history.** So build the history like this:
  1. Reset the local server, then run your history generator against it with the clock set back.
  2. `python scripts/bake_fixture.py --database sqlite:///data/local-demo.db --out contract/fixtures/seeded.json`. It refuses a broken event chain and leaves out operator data.
  3. Start the API with `RIVET_FIXTURE=contract/fixtures/seeded.json`. A reset now restores the history too.
  4. Today's open jobs and the median durations (hydraulic leak 55 minutes, gearbox 95) must not change, or `tests/test_thesis.py` will fail. Run the tests with the baked seed before committing it.
- Telemetry already exists: `python sim/telemetry.py --status fault|running`.

## Map pins and status chips

`GET /dashboard/summary` returns `sites` (with `lat_e6`, `lng_e6`) and `machines` (with `status`: Running, Fault detected, Under repair, and so on). The control room has a slot for each.

## Not built, so do not depend on it

The device hash link between queued commands (Tier 2), live push through the web host (the control room polls every 3 seconds), HEIC upload, phone OTP.

## Merging your work

1. Create your branch from the latest `main` (sign-in, session handling and navigation changed a lot).
2. Stay in your own paths: `web/app/(tech)/`, `web/lib/offline/`, `web/public/sw.js`, `adapters/billing/`, `seed/`, `demo/`, `e2e/`. Tell us before editing `web/lib/api.ts`, `web/components/session-bar.tsx` or `api/`.
3. Before opening a pull request: `python -m pytest tests`, `npm run typecheck`, `npm run build`, and your offline test (airplane mode, 7 queued actions, replay, 0 duplicates, 0 gaps).
