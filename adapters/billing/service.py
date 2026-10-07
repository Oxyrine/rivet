"""Polling service and invoice generation for the billing adapter."""
import logging
from datetime import datetime, timezone
from pathlib import Path
import requests

from .db import get_cursor, set_cursor, save_invoice, get_invoices, get_invoice_by_job
from .pricing import calculate_parts_cost, calculate_labour_cost

logger = logging.getLogger(__name__)

ACCEPTANCE_EVENT_TYPES = {'CustomerAccepted', 'AcceptanceRecorded', 'AcceptanceDeemed'}

class BillingAdapterService:
    def __init__(
        self,
        api_base_url: str = 'http://127.0.0.1:8000',
        user_id: str = 'coordinator',
        otp: str = '246810',
        db_path: Path | str | None = None,
    ):
        self.api_base_url = api_base_url.rstrip('/')
        self.user_id = user_id
        self.otp = otp
        self.db_path = db_path
        self._token: str | None = None

    def get_token(self) -> str:
        """Authenticates with the API to obtain a valid bearer token."""
        try:
            res = requests.post(
                f'{self.api_base_url}/auth/token',
                json={'user_id': self.user_id, 'otp': self.otp},
                timeout=5,
            )
            if res.status_code == 200:
                self._token = res.json().get('access_token')
                return self._token or ''
        except Exception as e:
            logger.warning(f'Billing auth error: {e}')
        return ''

    def get_headers(self) -> dict[str, str]:
        token = self._token or self.get_token()
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        return headers

    def poll_once(self) -> list[dict]:
        """Performs a single polling cycle of GET /subscriptions/billing/events?after=..."""
        after_seq = get_cursor(self.db_path)
        headers = self.get_headers()

        try:
            res = requests.get(
                f'{self.api_base_url}/subscriptions/billing/events?after={after_seq}',
                headers=headers,
                timeout=5,
            )
            if res.status_code == 401:
                # Token expired, refresh once
                self.get_token()
                res = requests.get(
                    f'{self.api_base_url}/subscriptions/billing/events?after={after_seq}',
                    headers=self.get_headers(),
                    timeout=5,
                )

            if res.status_code != 200:
                logger.warning(f'Polling failed ({res.status_code}): {res.text}')
                return []

            data = res.json()
            events = data.get('events', [])
            new_cursor = data.get('cursor', after_seq)

            drafted = []
            for ev in events:
                ev_type = ev.get('type')
                if ev_type in ACCEPTANCE_EVENT_TYPES:
                    payload = ev.get('payload', {})
                    job_id = payload.get('job_id')
                    if job_id:
                        inv = self.draft_invoice_for_job(job_id, ev)
                        if inv:
                            drafted.append(inv)

            if new_cursor > after_seq:
                set_cursor(new_cursor, self.db_path)

            return drafted

        except Exception as e:
            logger.warning(f'Poll exception: {e}')
            return []

    def draft_invoice_for_job(self, job_id: str, event: dict | None = None) -> dict | None:
        """Fetches job details and generates an itemized draft invoice."""
        headers = self.get_headers()
        try:
            res = requests.get(f'{self.api_base_url}/jobs/{job_id}', headers=headers, timeout=5)
            if res.status_code != 200:
                logger.warning(f'Could not fetch job {job_id} ({res.status_code})')
                return None

            job = res.json()
            report = job.get('report') or {}
            parts = report.get('parts') or job.get('planned_parts') or {}
            minutes = report.get('minutes') or job.get('duration_minutes') or 60

            parts_total, part_lines = calculate_parts_cost(parts)
            labour_total, labour_line = calculate_labour_cost(minutes)
            total = parts_total + labour_total

            all_lines = part_lines + [labour_line]

            invoice = {
                'id': f'INV-{job_id}',
                'job_id': job_id,
                'machine_id': job.get('machine_id', 'UNKNOWN'),
                'site_id': job.get('site_id', 'site-a'),
                'technician_id': job.get('technician_id'),
                'parts_total_paise': parts_total,
                'labour_total_paise': labour_total,
                'total_paise': total,
                'currency': 'INR',
                'status': 'draft',
                'lines': all_lines,
                'source_event_id': event.get('event_id') if event else None,
                'acceptance_type': (event.get('payload', {}).get('acceptance') if event else None) or job.get('acceptance') or 'Verified',
                'created_at': datetime.now(timezone.utc).isoformat(),
            }

            save_invoice(invoice, self.db_path)
            logger.info(f'Drafted invoice {invoice["id"]} for job {job_id}: ₹{total // 100}')
            return invoice

        except Exception as e:
            logger.error(f'Error drafting invoice for {job_id}: {e}')
            return None
