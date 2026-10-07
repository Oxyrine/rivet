The initial schema is versioned by `core.runtime.Base`: tenant snapshot, normalized event,
ledger_entry, outbox and 24-hour idempotency records. Startup creates missing tables and
installs immutable UPDATE/DELETE triggers for event and ledger_entry. PostgreSQL locks the
tenant snapshot with SELECT FOR UPDATE before loading any balance or issuing any event.
SQLite uses BEGIN IMMEDIATE, with a process mutex for local development.

This first slice serializes each tenant transaction and seals within that transaction.
It does not yet implement the specification's independent xid-based asynchronous sealer,
balance-row locks, background workers, or Alembic incremental upgrades. Serialization
preserves journal and chain correctness at lower concurrency; PostgreSQL load validation
remains required before claiming the specification's throughput targets.
