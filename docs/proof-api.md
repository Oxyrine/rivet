# Completion verification integration contract

All mutation routes accept `Idempotency-Key`; keys are actor scoped and bound to method, path and JSON body. Domain transactions preserve audit events and balanced resource movements.

## Independent issue and technician consumption

1. Storekeeper posts `/stores/issue` with `{"job_id":"J-2231","resource":"HS-40","quantity":1}`. The resource must already be held for that job from a warehouse in the storekeeper's scope. Units move from job reserved to job issued; the immutable `StoreIssued` event is the corroborating record.
2. Technician submits `PartScanned` via the device command API. Units move from issued to consumed and populate `scanned_parts`. This cannot create or change the store issue record. Reserved fallback is explicitly unconfirmed; van usage must have store-backed van units.
3. Report parts are compared with independent store issue events. Two seal kits reported against one issued are unexplained. Correcting to one kit and two O-rings permits a van-backed explained variance. `/jobs/{id}/variance` body `{"part":"O-RING","reason":"Used van stock"}` auto-clears only with backing, available units and fewer than three auto-clears in the technician's ISO week. Manager approval is explicit when this guard fails.

## Authentic evidence

Upload actual bytes first: `/evidence/uploads` body `{"photo_id":"before-2231","job_id":"J-2231","type":"before_photo","content_base64":"..."}`. Attach with `/jobs/J-2231/evidence` body `{"photo_id":"before-2231","type":"before_photo"}`. Required before/after photos must reference server-stored images whose content hash still matches. Metadata alone does not satisfy mandatory evidence. Files are private and require authorized job scope. Storage authenticates the retained bytes, not the physical scene or device capture time.

## Closure

`/jobs/{id}/report` accepts `parts`, `checklist`, integer `minutes`, and `notes`. A failed reconciliation records `ClosureBlocked` and returns the precise checks rather than discarding the report. A corrected report produces a new fingerprint; earlier reports remain in the event chain. Technician capacity is released to worked capacity, with any unused allocation returned to free capacity.

`/jobs/{id}/checkout` plus a subsequent in-band running telemetry observation restores service. Readings received before checkout cannot confirm restoration. Stabilization within 15 minutes attributes restoration to checkout; later observations use their received time. Post-service fault readings reopen the job and SLA.

`/jobs/{id}/accept` requires `pin`, registered `device_id`, exact `report_hash`, and customer presence confirmation where evidence is weak. Mandatory gaps and unexplained variances block acceptance. Fix confirmation is separate: absent checkout plus fresh running confirmation, the acceptance label is `Accepted, fix not independently confirmed`.

Email and paper alternatives retain distinct labels. Deeming requires elapsed 24 hours and both 12-hour and 20-hour reminders; missing independent issue entries remain unconfirmed and never become Verified. Disputes name individual lines and hold only those lines.

## Portable proof

`/jobs/{id}/package` and `/machines/{id}/package` return `{body,key,signature}`. Ed25519 signs canonical UTF-8 JSON. Body includes complete machine events, report fingerprint, acceptance, reconciliation, exact contract, SLA outcome and customer acceptance receipts. The standalone verifier never fetches a key or provider data. Pin the onboarding key out of band and retain a machine sequence/head. A rewritten and re-signed chain fails against that earlier customer-held head even if internal signatures and hashes pass. A new customer without a retained head cannot detect this attack.

The demo sensor feed and email OTP are simulated. Registered device identifiers plus PIN are a prototype binding, not hardware attestation. Rotation, revocation, real mail/SMS delivery and customer-operated sensor ownership are subsequent integration work.
