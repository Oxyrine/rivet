"""Reset state helper for billing adapter test."""
import os
import sys
from pathlib import Path

# Ensure root directory is on sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.app.core.runtime import store
from contract.state import emit
from adapters.billing.db import init_db

store.reset()

def fn(s):
    s.adapters['billing']['enabled'] = False
    s.jobs['J-2231'] = {
        'id': 'J-2231',
        'machine_id': 'M-104',
        'site_id': 'site-a',
        'technician_id': 'priya',
        'state': 'closed',
        'priority': 'P1',
        'fault': 'hydraulic_leak',
        'created_at': '2026-10-07T03:00:00+00:00',
        'deadline': '2026-10-07T08:45:00+00:00',
        'planned_start': '2026-10-07T06:30:00+00:00',
        'duration_minutes': 60,
        'planned_parts': {'HS-40': 1, 'O-RING': 2},
        'issued_parts': {'HS-40': 1, 'O-RING': 2},
        'evidence': [],
        'tasks': [],
        'checklist': [],
        'acceptance': 'Verified',
        'on_site': False,
        'report': {'parts': {'HS-40': 1, 'O-RING': 2}, 'minutes': 60},
        'report_hash': 'rep-hash-2231'
    }
    emit(s, 'CustomerAccepted', 'M-104', {'job_id': 'J-2231', 'acceptance': 'Verified'})
    return True

store.mutate(fn)

db_file = ROOT / 'adapters' / 'billing' / 'billing.db'
if db_file.exists():
    try:
        os.remove(db_file)
    except Exception:
        pass
init_db(db_file)

if __name__ == '__main__':
    print("Billing test state initialized.")
