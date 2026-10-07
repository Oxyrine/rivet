from datetime import datetime, timezone

def now(state=None):
    return datetime.fromisoformat(state.now) if state else datetime.now(timezone.utc)

def iso(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Timezone required')
    return parsed.astimezone(timezone.utc).isoformat()
