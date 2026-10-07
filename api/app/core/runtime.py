import json
import os
import threading
os.environ.setdefault('DISABLE_SQLALCHEMY_CEXT_RUNTIME', '1')
from pathlib import Path
from datetime import timedelta
from sqlalchemy import create_engine, Column, Integer, String, JSON, Text, select, text
from sqlalchemy.orm import DeclarativeBase, Session
from contract.state import LedgerState
from contract.canonical import canonical_json as canonical
from contract.errors import DomainError
from .clock import now

ROOT = Path(__file__).resolve().parents[3]

class Base(DeclarativeBase): pass

class Snapshot(Base):
    __tablename__ = 'tenant_state'
    tenant_id = Column(String, primary_key=True)
    data = Column(JSON, nullable=False)

class Event(Base):
    __tablename__ = 'event'
    ingest_id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String, unique=True, nullable=False)
    tenant_id = Column(String, nullable=False, index=True)
    tenant_seq = Column(Integer, nullable=False)
    payload = Column(JSON, nullable=False)

class Entry(Base):
    __tablename__ = 'ledger_entry'
    id = Column(Integer, primary_key=True, autoincrement=True)
    payload = Column(JSON, nullable=False)

class Outbox(Base):
    __tablename__ = 'outbox'
    id = Column(Integer, primary_key=True, autoincrement=True)
    payload = Column(JSON, nullable=False)

class Idempotency(Base):
    __tablename__ = 'idempotency'
    key = Column(String, primary_key=True)
    body = Column(Text, nullable=False)
    result = Column(JSON, nullable=False)
    expires_at = Column(String, nullable=False)

def database_url(url):
    """Hosted providers hand out postgres:// or postgresql://; SQLAlchemy needs the psycopg driver named."""
    for prefix in ('postgres://', 'postgresql://'):
        if url.startswith(prefix): return 'postgresql+psycopg://' + url[len(prefix):]
    return url

def engine_options(url):
    if url.startswith('sqlite'): return {'connect_args': {'check_same_thread': False, 'timeout': 30}, 'pool_pre_ping': True}
    # prepare_threshold=None keeps psycopg compatible with a transaction-mode pooler; the pool stays small for a managed database
    return {'connect_args': {'prepare_threshold': None}, 'pool_pre_ping': True, 'pool_size': 5, 'max_overflow': 5}

APP_TABLES = ('tenant_state', 'event', 'ledger_entry', 'outbox', 'idempotency')

def rls_statements():
    """Supabase serves public-schema tables over its REST API; with RLS on and no policies, the public keys see nothing."""
    return [f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY' for table in APP_TABLES]

def fixture():
    return LedgerState.from_dict(json.loads((ROOT / 'contract/fixtures/m104.json').read_text(encoding='utf-8')))

class Store:
    def __init__(self, url=None):
        self.url = url or os.getenv('DATABASE_URL', 'sqlite:///' + str(ROOT / 'rivet.db').replace('\\', '/'))
        self.url = database_url(self.url)
        self.engine = create_engine(self.url, **engine_options(self.url))
        self.lock = threading.RLock()
        Base.metadata.create_all(self.engine)
        self._triggers()
        with self.engine.begin() as conn:
            row = conn.execute(select(Snapshot).where(Snapshot.tenant_id == 'provider-demo')).first()
            if not row:
                state = fixture()
                conn.execute(Snapshot.__table__.insert().values(tenant_id=state.tenant_id, data=state.to_dict()))
                for e in state.events:
                    conn.execute(Event.__table__.insert().values(event_id=e['event_id'], tenant_id=e['tenant_id'], tenant_seq=e['tenant_seq'], payload=e))
                for entry in state.entries:
                    conn.execute(Entry.__table__.insert().values(payload=entry))

    def _triggers(self):
        with self.engine.begin() as conn:
            if self.engine.dialect.name == 'sqlite':
                for table in ('event', 'ledger_entry'):
                    for op in ('UPDATE', 'DELETE'):
                        conn.exec_driver_sql(f"CREATE TRIGGER IF NOT EXISTS immutable_{table}_{op.lower()} BEFORE {op} ON {table} BEGIN SELECT RAISE(ABORT, 'append-only audit table'); END")
            else:
                conn.exec_driver_sql("CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only audit table'; END $$")
                for table in ('event', 'ledger_entry'):
                    conn.exec_driver_sql(f'DROP TRIGGER IF EXISTS immutable_{table} ON {table}')
                    conn.exec_driver_sql(f'CREATE TRIGGER immutable_{table} BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation()')
                for statement in rls_statements(): conn.exec_driver_sql(statement)

    def read(self):
        with self.lock, Session(self.engine) as session:
            return LedgerState.from_dict(session.get(Snapshot, 'provider-demo').data).clone()

    def mutate(self, fn, *, key=None, body=None):
        from .idempotency import request_idempotency
        request_context=request_idempotency.get()
        if request_context:
            key=request_context['key']
            body=request_context['body']
        with self.lock, Session(self.engine) as session, session.begin():
            if self.engine.dialect.name == 'sqlite':
                session.execute(text('BEGIN IMMEDIATE'))
            row = session.execute(select(Snapshot).where(Snapshot.tenant_id == 'provider-demo').with_for_update()).scalar_one()
            state = LedgerState.from_dict(row.data).clone()
            if os.getenv('ENV','demo') not in ('demo','test'):state.now=now().isoformat()
            try:encoded = canonical(body or {})
            except ValueError as exc:raise DomainError('INVALID_COMMAND',str(exc),status=422)
            if isinstance(encoded, bytes): encoded = encoded.decode()
            if key:
                prior = session.get(Idempotency, key)
                if prior and now(state).isoformat() < prior.expires_at:
                    if prior.body != encoded:
                        raise DomainError('IDEMPOTENCY_MISMATCH', 'Key was used for a different command')
                    return prior.result
                if prior: session.delete(prior); session.flush()
            before_events, before_entries = len(state.events), len(state.entries)
            old_events=canonical(state.events)
            old_entries=canonical(state.entries)
            result = fn(state)
            if canonical(state.events[:before_events])!=old_events or canonical(state.entries[:before_entries])!=old_entries:
                raise DomainError('AUDIT_IMMUTABLE','Previously sealed events and journal entries cannot be changed')
            from api.app.modules.ledger.domain import invariants
            invariants(state)
            row.data = state.to_dict()
            for event in state.events[before_events:]:
                session.add(Event(event_id=event['event_id'], tenant_id=state.tenant_id, tenant_seq=event['tenant_seq'], payload=event))
                session.add(Outbox(payload=event))
            for entry in state.entries[before_entries:]: session.add(Entry(payload=entry))
            if key: session.add(Idempotency(key=key, body=encoded, result=result, expires_at=(now(state)+timedelta(hours=24)).isoformat()))
            return result

    def reset(self):
        with self.lock:
            # Demo reset recreates the complete database; normal command paths cannot erase audit records.
            Base.metadata.drop_all(self.engine)
            Base.metadata.create_all(self.engine)
            self._triggers()
            state = fixture()
            with Session(self.engine) as session, session.begin():
                session.add(Snapshot(tenant_id=state.tenant_id, data=state.to_dict()))
                for e in state.events: session.add(Event(event_id=e['event_id'], tenant_id=state.tenant_id, tenant_seq=e['tenant_seq'], payload=e))
                for entry in state.entries:session.add(Entry(payload=entry))
            return {'reset': True}

store = Store()
