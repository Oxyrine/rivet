# What each role sees

Scope (which sites, which technician) is decided in `api/app/core/auth.py`. Which fields come back is decided in `api/app/core/views.py`. The screens follow the same map in `web/lib/roles.ts`, but the API enforces every rule; hiding a link is never the only protection.

| Role | Lands on | Pages | Can change things | Data trimming |
| --- | --- | --- | --- | --- |
| admin | Control room | all, plus Team access and the field app | everything | none |
| coordinator | Control room | Control room, Machine passports, Service records | dispatch, requests, recovery plans | none |
| manager | Control room | same as coordinator | same, plus approvals that need a manager | none |
| auditor | Control room (read-only) | Control room, Machine passports, Service records | nothing | none: reads the whole record |
| supervisor (customer site lead) | Customer approvals | Customer approvals, Machine passports, Service records, Site arrival | confirms access and permits, accepts reports, enrols the gate | customer view |
| requester (customer) | Customer approvals | Customer approvals, Machine passports, Service records | requests service, confirms, disputes | customer view |
| storekeeper | Service records | Service records only (no stores screen yet) | issues parts through the API | sees no jobs |
| technician | Field app | Field app only | own job actions, report, evidence | own jobs only, no dispatcher ranking |

**Customer view** removes the provider's internal planning: the ranked technician candidates (skills and certificates), the assigned technician, planned parts, part and technician-time holds, SLA breach and recovery data, and the live event stream. A customer still gets their service, its state, the commitments they take part in, the report, the reconciliation and the evidence.

Signed-out visitors see only Service records, the customer-held record verifier, which anyone may use.

When a signed-in role opens a page outside its workspace, it gets a "not part of your workspace" page, and the API refuses the data anyway.
