import hashlib
import json

GENESIS = '0' * 64

def canonical_json(value):
    def check(v):
        if isinstance(v, float):
            raise ValueError('Floats are forbidden in hashed data; use integers or strings')
        if isinstance(v, dict):
            for k, item in v.items():
                if not isinstance(k, str):
                    raise ValueError('Object keys must be strings')
                check(item)
        elif isinstance(v, (list, tuple)):
            for item in v:
                check(item)
    check(value)
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def digest(previous, value):
    return hashlib.sha256((previous + canonical_json(value)).encode('utf-8')).hexdigest()

def machine_view(event):
    return {k: event.get(k) for k in ('event_id', 'machine', 'machine_seq', 'type', 'occurred_at', 'payload', 'cause_hash')}

def event_body(event):
    return {k: v for k, v in event.items() if k not in ('hash', 'machine_hash', 'prev_hash', 'machine_prev_hash')}

# Stable alias for lane implementations; both names return the same UTF-8 text.
canonical = canonical_json
