"""Headless scenario runner for the 9-step Rivet demo and verification sequence."""
import argparse
import base64
import json
import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

# Ensure root directory is in sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient

from api.app.main import app
from api.app.core.runtime import store
from api.app.modules.proof.package import verify
from seed.history import seed_history, GATE_KEY, GATE_PUB

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] (demo-runner) %(message)s')
logger = logging.getLogger('demo-runner')

TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6iAAAAABJRU5ErkJggg=='

class DemoRunner:
    def __init__(self, api_url: str | None = None, pause: bool = False, until_step: int = 9):
        self.api_url = api_url
        self.pause = pause
        self.until_step = until_step
        self.client = None
        self.tokens = {}
        self.gate_key = GATE_KEY
        self.gate_pub = GATE_PUB
        self.job_id = 'J-2231'
        self.req_id = 'R-2231'
        self.state_data = {}

        # Initialize API client
        if self.api_url:
            import requests
            self.session = requests.Session()
            self._use_http = True
        else:
            self.client = TestClient(app)
            self._use_http = False

    def auth(self, user_id: str, otp: str = '246810') -> str:
        if self._use_http:
            r = self.session.post(f'{self.api_url}/auth/token', json={'user_id': user_id, 'otp': otp})
            assert r.status_code == 200, f"Auth failed for {user_id}: {r.text}"
            token = r.json()['access_token']
        else:
            r = self.client.post('/auth/token', json={'user_id': user_id, 'otp': otp})
            assert r.status_code == 200, f"Auth failed for {user_id}: {r.text}"
            token = r.json()['access_token']
        self.tokens[user_id] = token
        return token

    def headers(self, user_id: str) -> dict:
        token = self.tokens.get(user_id) or self.auth(user_id)
        return {'Authorization': f'Bearer {token}', 'Idempotency-Key': str(uuid4())}

    def post(self, path: str, body: dict | None = None, user_id: str = 'coordinator') -> dict:
        headers = self.headers(user_id)
        if self._use_http:
            r = self.session.post(f'{self.api_url}{path}', json=body or {}, headers=headers)
            assert r.status_code < 400, f"POST {path} failed ({r.status_code}): {r.text}"
            return r.json()
        else:
            r = self.client.post(path, json=body or {}, headers=headers)
            assert r.status_code < 400, f"POST {path} failed ({r.status_code}): {r.text}"
            return r.json()

    def get(self, path: str, user_id: str = 'coordinator') -> dict:
        headers = self.headers(user_id)
        if self._use_http:
            r = self.session.get(f'{self.api_url}{path}', headers=headers)
            assert r.status_code < 400, f"GET {path} failed ({r.status_code}): {r.text}"
            return r.json()
        else:
            r = self.client.get(path, headers=headers)
            assert r.status_code < 400, f"GET {path} failed ({r.status_code}): {r.text}"
            return r.json()

    def set_clock(self, time_str: str):
        iso_str = f'2026-10-07T{time_str}+05:30' if ':' in time_str and 'T' not in time_str else time_str
        return self.post('/admin/clock', {'set': iso_str}, user_id='admin')

    def pause_point(self, step_num: int, step_desc: str):
        if self.pause:
            print(f"\n[PAUSE] Step {step_num}: {step_desc}")
            input("Press Enter to continue to next step...")

    def run(self):
        start_time = time.time()
        logger.info("=== STARTING 9-STEP RIVET DEMO SCENARIO ===")

        # Clean seed state and setup history + verifier memory
        logger.info("Initializing clean seed and 30-day history with Oct 3 anchor...")
        if not self._use_http:
            store.reset()
            seed_history(self.client)
        else:
            # When running against live server, trigger reset and seed
            store.reset()
            seed_history()

        # Step 1: 09:02 - M-104 breakdown
        if self.until_step >= 1:
            logger.info("--- Step 1 (09:02): M-104 Breakdown & Dispatch ---")
            self.set_clock('09:02:00')
            req = self.post('/requests', {'machine_id': 'M-104', 'fault': 'hydraulic_leak'}, user_id='coordinator')
            self.req_id = req['id']
            self.job_id = req['job_id']
            self.post(f'/requests/{self.req_id}/approve', user_id='coordinator')
            job = self.post(f'/jobs/{self.job_id}/assign', {'technician_id': 'ravi'}, user_id='coordinator')
            self.state_data['job'] = job
            logger.info(f"Step 1 Complete: Job {self.job_id} assigned to Ravi. HS-40 reserved at site-b.")
            self.pause_point(1, "Job assigned to Ravi with parts hold.")

        # Step 2: 10:10 - Ravi reports dropout & dynamic recovery
        if self.until_step >= 2:
            logger.info("--- Step 2 (10:10): Technician Dropout & Impact Walk ---")
            self.set_clock('10:10:00')
            drop_res = self.post('/technicians/ravi/dropout', {'reason': 'vehicle_breakdown'}, user_id='coordinator')
            
            s = store.read()
            breach_id = next(reversed(s.breaches))
            impact = self.get(f'/breaches/{breach_id}/impact', user_id='coordinator')
            logger.info(f"Ripple effect traced: {impact.get('affected_jobs')}")

            plans_data = self.get(f'/breaches/{breach_id}/plans', user_id='coordinator')
            plans = plans_data['plans'] if isinstance(plans_data, dict) and 'plans' in plans_data else plans_data
            assert len(plans) > 0, "No recovery plans found!"
            plan_a = plans[0]
            self.post(f"/plans/{plan_a['id']}/approve", user_id='coordinator')
            
            updated_job = store.read().jobs[self.job_id]
            assert updated_job['technician_id'] == 'priya', f"Expected Priya, got {updated_job['technician_id']}"
            logger.info("Step 2 Complete: Plan A approved. Job reassigned to Priya with stocked van.")
            self.pause_point(2, "Ravi dropout recovered with Plan A (Priya).")

        # Step 3: 11:05 - Gate Arrival & Strong Presence
        if self.until_step >= 3:
            logger.info("--- Step 3 (11:05): Gate Arrival & Cryptographic Check-In ---")
            self.post(f'/customer-commitments/permit_to_work:{self.job_id}/confirm', user_id='supervisor')
            self.set_clock('11:05:00')

            try:
                self.post('/sites/site-a/gate-key', {'public_key': self.gate_pub}, user_id='supervisor')
            except Exception:
                pass

            clock_now = store.read().now
            window = int(datetime.fromisoformat(clock_now).timestamp()) // 30
            sig = base64.b64encode(self.gate_key.sign(f'site-a|{window}'.encode())).decode()
            arrival_code = {'window': window, 'signature': sig}

            self.post(
                f'/jobs/{self.job_id}/actions/CheckIn',
                {
                    'arrival_code': arrival_code,
                    'gps': {'lat_e6': 19076000, 'lng_e6': 72877000},
                    'machine_qr': 'M-104',
                },
                user_id='priya',
            )
            logger.info("Step 3 Complete: Priya checked in with rotating gate QR signature.")
            self.pause_point(3, "Arrival check-in verified with cryptographic presence.")

        # Step 4: 11:07 - Permit to Work Lockout Verification
        if self.until_step >= 4:
            logger.info("--- Step 4 (11:07): Permit-to-Work Lockout Check ---")
            self.set_clock('11:07:00')
            if not self._use_http:
                r = self.client.post(f'/jobs/{self.job_id}/actions/StartWork', json={}, headers=self.headers('priya'))
                assert r.status_code == 409 and r.json().get('code') == 'PERMIT_PENDING'
            else:
                r = self.session.post(f'{self.api_url}/jobs/{self.job_id}/actions/StartWork', json={}, headers=self.headers('priya'))
                assert r.status_code == 409 and r.json().get('code') == 'PERMIT_PENDING'
            logger.info("Step 4 Complete: StartWork blocked with PERMIT_PENDING as expected.")
            self.pause_point(4, "Permit lockout verified.")

        # Step 5: 11:17 - Permit Fulfilment & Work Started
        if self.until_step >= 5:
            logger.info("--- Step 5 (11:17 - 11:20): Permit Fulfilled & Work Started ---")
            self.set_clock('11:17:00')
            self.post(f'/customer-commitments/permit_to_work:{self.job_id}/fulfil', user_id='supervisor')
            
            self.set_clock('11:20:00')
            self.post(f'/jobs/{self.job_id}/actions/StartWork', user_id='priya')
            
            self.post('/stores/issue', {'job_id': self.job_id, 'resource': 'HS-40', 'quantity': 1}, user_id='storekeeper')
            self.post(f'/jobs/{self.job_id}/actions/PartScanned', {'resource': 'HS-40', 'quantity': 1}, user_id='priya')
            logger.info("Step 5 Complete: Work started. Parts issued and scanned.")
            self.pause_point(5, "Work in progress.")

        # Step 6: 12:20 - Evidence photos & Checkout
        if self.until_step >= 6:
            logger.info("--- Step 6 (12:20): Evidence Photos Attached & Checkout ---")
            for kind in ('before_photo', 'after_photo'):
                self.post(
                    '/evidence/uploads',
                    {'photo_id': kind, 'job_id': self.job_id, 'type': kind, 'content_base64': TINY_PNG},
                    user_id='priya',
                )
                self.post(f'/jobs/{self.job_id}/evidence', {'type': kind, 'photo_id': kind}, user_id='priya')
            
            self.set_clock('12:20:00')
            self.post(f'/jobs/{self.job_id}/checkout', user_id='priya')
            logger.info("Step 6 Complete: Photos uploaded and Priya checked out.")
            self.pause_point(6, "Photos attached and checkout recorded.")

        # Step 7: 12:22 - Telemetry Confirmation & In-Band Verification
        if self.until_step >= 7:
            logger.info("--- Step 7 (12:22): In-Band Telemetry Verification ---")
            self.post(
                '/telemetry',
                {
                    'machine_id': 'M-104',
                    'reading_id': str(uuid4()),
                    'running': True,
                    'in_band': True,
                    'pressure_bar': 140,
                    'status': 'running',
                },
                user_id='coordinator',
            )
            logger.info("Step 7 Complete: Machine pressure confirmed running in-band. SLA sealed.")
            self.pause_point(7, "Telemetry confirmed running.")

        # Step 8: 12:24 - Report, Van Stock Variance & Customer Acceptance
        if self.until_step >= 8:
            logger.info("--- Step 8 (12:24 - 12:26): Report, Variance & Supervisor Sign-off ---")
            self.set_clock('12:24:00')
            checklist = store.read().metadata['required_checklist']
            
            self.post(
                f'/jobs/{self.job_id}/report',
                {'parts': {'HS-40': 1, 'O-RING': 2}, 'checklist': checklist, 'minutes': 60},
                user_id='priya',
            )
            self.post(f'/jobs/{self.job_id}/variance', {'part': 'O-RING', 'reason': 'Used van stock'}, user_id='priya')

            job = store.read().jobs[self.job_id]
            assert job['reconciliation']['outcome'] == 'Explained variance'
            assert job['sla']['margin_minutes'] == 54

            self.set_clock('12:26:00')
            supervisor = store.read().users['supervisor']
            accept_payload = {
                'pin': supervisor['pin'],
                'device_id': supervisor['device_id'],
                'report_hash': job['report_hash'],
            }
            receipt = self.post(f'/jobs/{self.job_id}/accept', accept_payload, user_id='supervisor')
            self.state_data['receipt'] = receipt
            logger.info("Step 8 Complete: Report accepted and verified by supervisor with receipt.")
            self.pause_point(8, "Customer acceptance signed.")

        # Step 9: 12:26 / 3:50 Beat - Proof Package, Tamper Test & Anchor Check
        if self.until_step >= 9:
            logger.info("--- Step 9: Proof Package Export & Tamper Attack Verification ---")
            package = self.get('/machines/M-104/package', user_id='supervisor')
            assert package['body']['acceptance'] == 'Verified'
            self.state_data['package'] = package

            demo_dir = ROOT / 'demo'
            pkg_file = demo_dir / 'm104_package.json'
            pkg_file.write_text(json.dumps(package, indent=2), encoding='utf-8')

            # Invoke demo/tamper.py for the 3:50 beat
            tamper_script = demo_dir / 'tamper.py'
            tamper_out = demo_dir / 'tampered'
            env = {**os.environ, 'PYTHONPATH': str(ROOT)}
            subprocess.run([sys.executable, str(tamper_script), str(pkg_file), '--output', str(tamper_out)], cwd=str(ROOT), env=env, check=True)
            logger.info("tamper.py generated naive-edit.json and rewritten-resigned.json.")

            pinned_key = package['key']['public_key']
            receipt = self.state_data.get('receipt')

            # Load Oct 3 customer remembered anchor
            memory_file = ROOT / 'verifier' / 'memory.json'
            anchors = [receipt]
            if memory_file.exists():
                mem_data = json.loads(memory_file.read_text())
                if mem_data.get('receipt'):
                    anchors.append(mem_data['receipt'])

            # 1. Verify original package
            res_orig = verify(package, pinned_key, anchors)
            assert res_orig['valid'], f"Original package failed verification: {res_orig}"
            logger.info("✓ Original package: VALID against pinned key and remembered anchors.")

            # 2. Verify naive edit (tampered payload without re-signing)
            naive_pkg = json.loads((tamper_out / 'naive-edit.json').read_text())
            res_naive = verify(naive_pkg, pinned_key, anchors)
            assert not res_naive['valid'], "Naive edit was unexpectedly accepted!"
            logger.info("✓ Naive edit: REJECTED by cryptographic signature check.")

            # 3. Verify rewritten-resigned package against customer anchor
            rewritten_pkg = json.loads((tamper_out / 'rewritten-resigned.json').read_text())
            res_rewritten_no_anchor = verify(rewritten_pkg, pinned_key)
            assert res_rewritten_no_anchor['valid'], "Rewritten-resigned should pass signature check alone"
            
            res_rewritten_with_anchor = verify(rewritten_pkg, pinned_key, anchors)
            assert not res_rewritten_with_anchor['valid'], "Rewritten-resigned was NOT caught by anchor!"
            logger.info(f"✓ Insider rewrite/resign: CAUGHT by customer anchor! Error: {res_rewritten_with_anchor['errors']}")
            self.pause_point(9, "Proof package and tamper detection verified.")

        elapsed = time.time() - start_time
        logger.info(f"=== DEMO RUNNER FINISHED SUCCESSFULLY in {elapsed:.2f}s ===")
        assert elapsed < 60.0, f"Demo runner exceeded 60s limit: {elapsed:.2f}s"
        return True

def main():
    parser = argparse.ArgumentParser(description='Rivet 9-step demo runner')
    parser.add_argument('--until', type=int, default=9, help='Run scenario until step N (1-9)')
    parser.add_argument('--pause', action='store_true', help='Pause for rehearsal between steps')
    parser.add_argument('--api', type=str, default=None, help='API URL (default: in-process TestClient)')
    args = parser.parse_args()

    runner = DemoRunner(api_url=args.api, pause=args.pause, until_step=args.until)
    runner.run()

if __name__ == '__main__':
    main()
