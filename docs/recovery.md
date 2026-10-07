# Recovery planning

When a technician drops out, the solver looks at every job that depended on them and searches technician combinations jointly across time, parts and SLA penalties. Plans are ranked by P1 misses, P2 misses, P3 misses, penalty exposure, commitments changed, added travel, then continuity with technicians who know the machine.

**Complete plans** place every affected job. They appear as Plan A, B, C. A plan that uses an approved contractor needs a service manager to approve it; every other plan can be approved by a dispatcher.

**When no complete plan exists**, the solver no longer gives up. It searches again for the best partial plans, which place as many jobs as possible, P1 jobs first, and name each job they cannot place. A dispatcher can approve a partial plan. The jobs it places are reassigned immediately; the others are flagged for follow-up (`recovery_status: needs_follow_up`, a `RecoveryUnplaced` event) and the breach stays `PARTIALLY_RECOVERED` until they are dealt with. Generating the plan again later, once a technician is available again, picks up only those remaining jobs.

**For every job the solver cannot place**, the response lists who was ruled out and why (dropped out, certificate expired, skill level, travel limit, contractor not approved) and what a person can do: offer the customer a later slot (P2 and P3 only), wait for an unavailable technician, check certifications, or ask the service manager to authorise an approved contractor or overtime for a P1 job. Escalation is one option, not the only output.

API: `GET /exceptions/plans/{technician_id}` returns `plans`, `partial_plans`, `jobs` (the per-job diagnostics), `rejected`, `no_feasible_path` (true when there is no complete plan) and `message`.

## Risk radar

`GET /exceptions/risk` returns one row per open job with its `signals`, a `tier` and the assigned `technician_id`. A points total hits the ceiling for every job a dropout touches, so the tier is what separates them:

- **critical**: a projected SLA miss, or any hard signal on a P1 job
- **high**: another hard signal (technician dropout, unassigned, broken commitment)
- **watch**: only a thin SLA margin
- **ok**: no signals

Rows are ordered worst tier first, then priority, then SLA margin. The control room groups the jobs a dropout caused into one card for that technician, with a shortcut into that technician's impact and recovery plans, and lists only the remaining at-risk jobs individually.
