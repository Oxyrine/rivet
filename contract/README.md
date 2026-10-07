# Shared contract v1

Person A owns this directory. Lanes ask the integrator before changing it.

All domain modules operate on `LedgerState`. Functions must never mutate their input:
`apply(state, command) -> (new_state, events)` or `DomainError`.
IDs and quantities are strings and integers; money is integer paise. Hashed objects prohibit floats.
Time uses timezone-aware ISO strings, UTC on the server. `state.now` is the domain clock.

The runtime seam is `api.app.core.runtime.store`:
- `store.read() -> LedgerState` returns a detached copy.
- `store.mutate(fn, *, key=None, body=None) -> JSON value`: transactionally loads state,
  calls `fn(state)`, persists it and its new events/entries. Errors roll back.
- HTTP handlers receive `principal = Depends(require_roles(...))`. Principal has
  `user_id`, `role`, `tenant_id`, `sites`, `technician_id`, `device_id`.
- `scoped_job(state, job_id, principal)` and `scoped_machine(...)` enforce scope.
- `emit(state, type, machine, payload, actor)` creates sealed event envelopes.

Lane routers expose `router` from `api.app.modules.<lane>.routes`.
The API entry point includes ledger, exceptions and proof routers. No B-owned files are required for API startup.
