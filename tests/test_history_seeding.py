"""Tests for 30-day historical seeding and M-104 passport requirements."""
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from api.app.main import app
from api.app.core.runtime import store
from seed.history import seed_history

@pytest.fixture
def http_client():
    store.reset()
    with TestClient(app) as client:
        yield client

def test_seed_history_and_m104_passport(http_client):
    summary = seed_history(http_client)
    
    # Verify M-104 passport counts
    assert summary['m104_jobs'] == 18
    assert summary['m104_sla_met'] == 17
    assert summary['m104_verified'] == 15
    assert summary['m104_deemed'] == 2
    assert summary['m104_disputed'] == 1
    assert summary['median_duration'] == 55
    
    # Verify Oct 3 receipt was saved
    receipt_path = Path('data/m104_3oct_receipt.json')
    assert receipt_path.exists()
    receipt = json.loads(receipt_path.read_text())
    assert receipt['machine_id'] == 'M-104'
    assert receipt['acceptance'] == 'Verified'
    
    # Verify verifier memory was saved
    memory_path = Path('verifier/memory.json')
    assert memory_path.exists()
    memory = json.loads(memory_path.read_text())
    assert memory['machine_id'] == 'M-104'
    assert memory['receipt']['machine_seq'] > 0

    # Verify today's 11 fixture open jobs remain untouched
    s = store.read()
    for jid in ['J-2236', 'J-2239', 'J-2240', 'J-2253', 'J-2254', 'J-2255', 'J-2256', 'J-2257', 'J-2258', 'J-2259', 'J-2260']:
        assert jid in s.jobs
        # three jobs are deliberately released so the demo can assign them live; the rest stay assigned
        assert s.jobs[jid]['state'] == ('approved' if jid in s.metadata['demo_floor'] else 'assigned')
        assert s.jobs[jid]['acceptance'] == 'Pending'
    
    # Verify next_request is ready for today's demo at 2231
    assert s.metadata['next_request'] == 2231
