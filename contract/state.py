from dataclasses import dataclass, field, asdict
from copy import deepcopy
from .canonical import GENESIS, digest, machine_view, event_body

@dataclass
class LedgerState:
    now: str = '2026-10-07T03:32:00+00:00'
    tenant_id: str = 'provider-demo'
    sites: dict = field(default_factory=dict)
    machines: dict = field(default_factory=dict)
    technicians: dict = field(default_factory=dict)
    contracts: dict = field(default_factory=dict)
    jobs: dict = field(default_factory=dict)
    requests: dict = field(default_factory=dict)
    commitments: dict = field(default_factory=dict)
    balances: dict = field(default_factory=dict)
    entries: list = field(default_factory=list)
    events: list = field(default_factory=list)
    breaches: dict = field(default_factory=dict)
    plans: dict = field(default_factory=dict)
    evidence: dict = field(default_factory=dict)
    devices: dict = field(default_factory=dict)
    pauses: dict = field(default_factory=dict)
    variances: dict = field(default_factory=dict)
    receipts: list = field(default_factory=list)
    adapters: dict = field(default_factory=lambda: {'telemetry': {'enabled': True}, 'billing': {'enabled': False}})
    users: dict = field(default_factory=dict)
    metadata: dict = field(default_factory=dict)

    def clone(self):
        return deepcopy(self)

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, value):
        from .lifecycle import migrate
        return migrate(cls(**{k: v for k, v in value.items() if k in cls.__dataclass_fields__}))

def emit(state, event_type, machine=None, payload=None, actor='system', cause_hash=None):
    events = state.events
    same = [e for e in events if machine and e.get('machine') == machine]
    event = {'event_id': f'evt-{len(events)+1:06d}', 'tenant_seq': len(events)+1,
             'tenant_id': state.tenant_id, 'type': event_type, 'machine': machine,
             'machine_seq': len(same)+1 if machine else None,
             'occurred_at': state.now, 'actor': actor, 'payload': deepcopy(payload or {}),
             'cause_hash': cause_hash}
    event['prev_hash'] = events[-1]['hash'] if events else GENESIS
    event['machine_prev_hash'] = same[-1]['machine_hash'] if same else GENESIS
    event['hash'] = digest(event['prev_hash'], event_body(event))
    event['machine_hash'] = digest(event['machine_prev_hash'], machine_view(event)) if machine else None
    events.append(event)
    return event
