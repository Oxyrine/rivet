from datetime import datetime
from math import ceil

def instant(value):
    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        raise ValueError('A timezone is required')
    return dt

def running_seconds(start, stop, pauses=()):
    lo, hi = instant(start), instant(stop)
    intervals = sorted((max(lo, instant(p['start'])), min(hi, instant(p['end'])))
                       for p in pauses if p.get('confirmed') and p.get('end'))
    merged = []
    for a, b in intervals:
        if b <= a:
            continue
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(b, merged[-1][1]))
        else:
            merged.append((a, b))
    return max(0, int((hi-lo).total_seconds()) - sum(int((b-a).total_seconds()) for a,b in merged))

def outcome(start, stop, contract, pauses=()):
    elapsed = running_seconds(start, stop, pauses)
    target = contract.get('resolution_minutes', 240) * 60
    late = max(0, elapsed - target)
    units = ceil(late / (contract.get('penalty_unit_minutes', 15)*60))
    penalty = min(units*contract.get('penalty_rate_paise', 0), contract.get('penalty_cap_paise', 0))
    return {'met': late == 0, 'running_seconds': elapsed, 'late_seconds': late,
            'margin_minutes': (target-elapsed)//60, 'penalty_paise': penalty}
