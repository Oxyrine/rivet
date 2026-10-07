"""Seed historical closed jobs for the 30-day window leading up to demo day."""
import base64
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

# Ensure repo root is on sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient
from api.app.main import app
from api.app.core.runtime import store

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] (seed-history) %(message)s')
logger = logging.getLogger('seed-history')

TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6iAAAAABJRU5ErkJggg=='
GATE_KEY = Ed25519PrivateKey.generate()
GATE_PUB = base64.b64encode(GATE_KEY.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode()

def get_auth_token(client: TestClient, user_id: str, otp: str = '246810') -> str:
    r = client.post('/auth/token', json={'user_id': user_id, 'otp': otp})
    if r.status_code != 200:
        raise RuntimeError(f"Auth failed for {user_id}: {r.status_code} {r.text}")
    return r.json()['access_token']

def seed_history(api_client: TestClient | None = None) -> dict:
    """Creates 30 days of sealed historical jobs through the public API."""
    client = api_client or TestClient(app)
    
    # Pre-fetch auth tokens for standard roles
    tokens = {
        'admin': get_auth_token(client, 'admin'),
        'coordinator': get_auth_token(client, 'coordinator'),
        'supervisor': get_auth_token(client, 'supervisor'),
        'storekeeper': get_auth_token(client, 'storekeeper'),
        'priya': get_auth_token(client, 'priya'),
        'ravi': get_auth_token(client, 'ravi'),
        'dev': get_auth_token(client, 'dev'),
        'karthik': get_auth_token(client, 'karthik'),
        'meena': get_auth_token(client, 'meena'),
    }
    
    def headers(user: str) -> dict:
        return {'Authorization': f'Bearer {tokens[user]}', 'Idempotency-Key': str(uuid4())}

    def set_clock(iso_str: str):
        r = client.post('/admin/clock', json={'set': iso_str}, headers=headers('admin'))
        if r.status_code != 200:
            raise RuntimeError(f"Failed to set clock to {iso_str}: {r.status_code} {r.text}")

    # Ensure gate keys enrolled for site-a
    try:
        client.post('/sites/site-a/gate-key', json={'public_key': GATE_PUB}, headers=headers('supervisor'))
    except Exception:
        pass

    # Ensure daily shift slot capacity and store stock exist for historical dates
    # and start historical requests at sequence 2001 to avoid colliding with today's 12 jobs (J-2236..J-2260)
    def setup_historical_resources(s):
        s.metadata['next_request'] = 2001
        tech_ids = ['priya', 'ravi', 'dev', 'karthik', 'meena', 'contractor-1']
        start_date = datetime(2026, 9, 7)
        for d in range(31):
            dt = start_date + timedelta(days=d)
            ds = dt.strftime('%Y-%m-%d')
            for tid in tech_ids:
                acc = f'tech:{tid}:{ds}:free|TIME'
                if acc not in s.balances:
                    s.balances[acc] = 32
                    s.metadata.setdefault('initial_resource_totals', {})['TIME'] = (
                        s.metadata.get('initial_resource_totals', {}).get('TIME', 0) + 32
                    )
        # Ensure sufficient store parts for historical repairs
        for part, qty in [('HS-40', 100), ('O-RING', 200), ('JACK', 10)]:
            store_acc = f'store:site-b:available|{part}'
            s.balances[store_acc] = s.balances.get(store_acc, 0) + qty
            s.metadata.setdefault('initial_resource_totals', {})[part] = (
                s.metadata.get('initial_resource_totals', {}).get(part, 0) + qty
            )
        return True

    store.mutate(setup_historical_resources)

    # Historical job definitions for M-104:
    # 18 jobs (17 SLA met, 15 Verified, 2 Deemed, 1 Disputed)
    # Realistic durations: [50, 53, 55, 58, 60] with median = 55
    m104_schedule = [
        # (date_str, duration_min, sla_missed, acceptance, tech)
        ('2026-09-08T09:00:00+05:30', 55, False, 'Verified', 'priya'),
        ('2026-09-10T09:00:00+05:30', 50, False, 'Verified', 'ravi'),
        ('2026-09-12T09:00:00+05:30', 58, False, 'Verified', 'dev'),
        ('2026-09-14T09:00:00+05:30', 53, False, 'Verified', 'priya'),
        ('2026-09-16T09:00:00+05:30', 55, False, 'Deemed',   'ravi'),
        ('2026-09-18T09:00:00+05:30', 60, False, 'Verified', 'priya'),
        ('2026-09-20T09:00:00+05:30', 55, False, 'Verified', 'dev'),
        ('2026-09-22T09:00:00+05:30', 50, False, 'Verified', 'priya'),
        ('2026-09-24T09:00:00+05:30', 58, False, 'Verified', 'ravi'),
        ('2026-09-26T09:00:00+05:30', 55, True,  'Disputed', 'priya'), # SLA missed (270 min resolution > 240)
        ('2026-09-28T09:00:00+05:30', 53, False, 'Verified', 'dev'),
        ('2026-09-29T09:00:00+05:30', 60, False, 'Verified', 'priya'),
        ('2026-10-01T09:00:00+05:30', 55, False, 'Deemed',   'ravi'),
        ('2026-10-02T09:00:00+05:30', 50, False, 'Verified', 'priya'),
        ('2026-10-03T09:00:00+05:30', 55, False, 'Verified', 'priya'), # OCT 3 ANCHOR
        ('2026-10-04T09:00:00+05:30', 58, False, 'Verified', 'dev'),
        ('2026-10-05T09:00:00+05:30', 53, False, 'Verified', 'ravi'),
        ('2026-10-06T09:00:00+05:30', 60, False, 'Verified', 'priya'),
    ]

    oct3_receipt = None
    oct3_package = None

    logger.info(f"Seeding {len(m104_schedule)} historical M-104 jobs across 30 days...")

    for item in m104_schedule:
        start_iso, duration, sla_missed, acceptance_type, tech = item
        start_dt = datetime.fromisoformat(start_iso)
        machine_id = 'M-104'
        fault = 'hydraulic_leak'

        # 1. Set start clock
        set_clock(start_dt.isoformat())

        # 2. Create service request
        r_req = client.post('/requests', json={'machine_id': machine_id, 'fault': fault}, headers=headers('coordinator'))
        if r_req.status_code != 200:
            raise RuntimeError(f"Request failed for {machine_id}: {r_req.text}")
        req_data = r_req.json()
        req_id = req_data['id']
        job_id = req_data['job_id']

        # 3. Approve if not auto-approved
        if not req_data.get('auto_approved'):
            client.post(f'/requests/{req_id}/approve', json={}, headers=headers('coordinator'))

        # 4. Assign job
        r_assign = client.post(f'/jobs/{job_id}/assign', json={'technician_id': tech}, headers=headers('coordinator'))
        if r_assign.status_code != 200:
            raise RuntimeError(f"Assign failed for {job_id}: {r_assign.text}")

        # 5. Confirm permit
        client.post(f'/customer-commitments/permit_to_work:{job_id}/confirm', json={}, headers=headers('supervisor'))

        # 6. Check-in with arrival code
        checkin_dt = start_dt + timedelta(minutes=15)
        set_clock(checkin_dt.isoformat())

        window = int(checkin_dt.timestamp()) // 30
        sig = base64.b64encode(GATE_KEY.sign(f'site-a|{window}'.encode())).decode()
        arrival_code = {'window': window, 'signature': sig}

        r_cin = client.post(
            f'/jobs/{job_id}/actions/CheckIn',
            json={
                'arrival_code': arrival_code,
                'gps': {'lat_e6': 19076000, 'lng_e6': 72877000},
                'machine_qr': machine_id,
            },
            headers=headers(tech),
        )
        if r_cin.status_code != 200:
            raise RuntimeError(f"Checkin failed for {job_id}: {r_cin.text}")

        # 7. Fulfil permit
        client.post(f'/customer-commitments/permit_to_work:{job_id}/fulfil', json={}, headers=headers('supervisor'))

        # 8. Start work
        work_start_dt = checkin_dt + timedelta(minutes=5)
        set_clock(work_start_dt.isoformat())
        client.post(f'/jobs/{job_id}/actions/StartWork', json={}, headers=headers(tech))

        # 9. Parts issued & scanned
        parts_reported = {'HS-40': 1}
        client.post('/stores/issue', json={'job_id': job_id, 'resource': 'HS-40', 'quantity': 1}, headers=headers('storekeeper'))
        client.post(f'/jobs/{job_id}/actions/PartScanned', json={'resource': 'HS-40', 'quantity': 1}, headers=headers(tech))

        # 10. Upload evidence photos
        for ptype in ['before_photo', 'after_photo']:
            photo_id = f'{job_id}-{ptype}'
            client.post(
                '/evidence/uploads',
                json={'photo_id': photo_id, 'job_id': job_id, 'type': ptype, 'content_base64': TINY_PNG},
                headers=headers(tech),
            )
            client.post(f'/jobs/{job_id}/evidence', json={'type': ptype, 'photo_id': photo_id}, headers=headers(tech))

        # 11. Checkout & machine restored
        elapsed_work = 270 if sla_missed else duration
        checkout_dt = work_start_dt + timedelta(minutes=elapsed_work)
        set_clock(checkout_dt.isoformat())

        client.post(f'/jobs/{job_id}/checkout', json={}, headers=headers(tech))
        client.post(
            '/telemetry',
            json={'machine_id': machine_id, 'reading_id': str(uuid4()), 'running': True, 'in_band': True, 'pressure_bar': 140, 'status': 'running'},
            headers=headers('coordinator'),
        )

        # 12. Submit report
        checklist = store.read().metadata['required_checklist']
        r_rep = client.post(
            f'/jobs/{job_id}/report',
            json={'parts': parts_reported, 'checklist': checklist, 'minutes': duration},
            headers=headers(tech),
        )
        if r_rep.status_code != 200:
            raise RuntimeError(f"Report failed for {job_id}: {r_rep.text}")

        # 13. Acceptance
        rep_hash = store.read().jobs[job_id]['report_hash']

        if acceptance_type == 'Verified':
            r_acc = client.post(
                f'/jobs/{job_id}/accept',
                json={'pin': '4826', 'device_id': 'device-supervisor', 'report_hash': rep_hash},
                headers=headers('supervisor'),
            )
            if r_acc.status_code != 200:
                raise RuntimeError(f"Accept failed for {job_id}: {r_acc.text}")
            receipt = r_acc.json()

            # If Oct 3, keep receipt and package for verifier memory
            if '2026-10-03' in start_iso:
                oct3_receipt = receipt
                r_pkg = client.get('/machines/M-104/package', headers=headers('supervisor'))
                if r_pkg.status_code == 200:
                    oct3_package = r_pkg.json()

        elif acceptance_type == 'Deemed':
            # Advance clock by 25h and trigger reminders
            deem_dt = checkout_dt + timedelta(hours=25)
            set_clock(deem_dt.isoformat())
            client.post('/proof/reminders', json={}, headers=headers('coordinator'))

        elif acceptance_type == 'Disputed':
            r_disp = client.post(
                f'/jobs/{job_id}/dispute',
                json={'lines': ['labour'], 'reason': 'Customer disputed SLA and labour duration'},
                headers=headers('supervisor'),
            )
            if r_disp.status_code != 200:
                raise RuntimeError(f"Dispute failed for {job_id}: {r_disp.text}")
            store.mutate(lambda s: s.jobs[job_id].update(state='closed'))

    # Set next_request back to 2231 so today's first demo request is J-2231
    store.mutate(lambda s: s.metadata.update(next_request=2231))

    # Restore demo clock to Oct 7, 2026 morning (demo time)
    set_clock('2026-10-07T03:32:00+00:00')

    # Save Oct 3 memory/anchor for verifier
    data_dir = ROOT / 'data'
    data_dir.mkdir(parents=True, exist_ok=True)
    verifier_dir = ROOT / 'verifier'
    verifier_dir.mkdir(parents=True, exist_ok=True)

    anchor_payload = {
        'machine_id': 'M-104',
        'date': '2026-10-03',
        'receipt': oct3_receipt,
        'package': oct3_package,
    }

    if oct3_receipt:
        (data_dir / 'm104_3oct_receipt.json').write_text(json.dumps(oct3_receipt, indent=2), encoding='utf-8')
        (verifier_dir / 'memory.json').write_text(json.dumps(anchor_payload, indent=2), encoding='utf-8')
        logger.info("Saved Oct 3 verifier memory anchor to data/m104_3oct_receipt.json and verifier/memory.json")

    # Verify M-104 passport counts
    s = store.read()
    m104_jobs = [j for j in s.jobs.values() if j['machine_id'] == 'M-104']
    verified_count = sum(1 for j in m104_jobs if j.get('acceptance') == 'Verified')
    deemed_count = sum(1 for j in m104_jobs if j.get('acceptance') == 'Deemed accepted')
    disputed_count = sum(1 for j in m104_jobs if j.get('acceptance') == 'Disputed')
    sla_met_count = sum(1 for j in m104_jobs if j.get('sla', {}).get('met'))

    durations = [j.get('report', {}).get('minutes', 60) for j in m104_jobs if j.get('report')]
    median_duration = sorted(durations)[len(durations)//2] if durations else 55

    logger.info(f"Seeding complete! M-104 passport summary:")
    logger.info(f"- Total closed jobs: {len(m104_jobs)}")
    logger.info(f"- SLA met: {sla_met_count} / {len(m104_jobs)}")
    logger.info(f"- Verified: {verified_count}")
    logger.info(f"- Deemed accepted: {deemed_count}")
    logger.info(f"- Disputed: {disputed_count}")
    logger.info(f"- Median duration: {median_duration} min")

    return {
        'total_jobs': len(m104_schedule),
        'm104_jobs': len(m104_jobs),
        'm104_sla_met': sla_met_count,
        'm104_verified': verified_count,
        'm104_deemed': deemed_count,
        'm104_disputed': disputed_count,
        'median_duration': median_duration,
        'oct3_receipt': oct3_receipt,
    }

if __name__ == '__main__':
    store.reset()
    seed_history()
