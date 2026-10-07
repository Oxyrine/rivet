import os
from datetime import datetime, timezone

def demo_controls():
    """The scripted clock and data reset: always on in demo and test runs, and on a hosted server only when an operator turns it on."""
    return os.getenv('ENV','demo') in ('demo','test') or os.getenv('DEMO_CONTROLS')=='1'

def now(state=None):
    return datetime.fromisoformat(state.now) if state else datetime.now(timezone.utc)

def iso(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Timezone required')
    return parsed.astimezone(timezone.utc).isoformat()
