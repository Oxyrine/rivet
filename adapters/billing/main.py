"""Billing adapter standalone process runner."""
import argparse
import logging
import sys
import time
from pathlib import Path

from .service import BillingAdapterService
from .db import get_invoices, get_invoice_by_job, init_db

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] (billing-adapter) %(message)s'
)
logger = logging.getLogger('billing-adapter')

def main():
    parser = argparse.ArgumentParser(description='Rivet Billing Adapter Process')
    parser.add_argument('--api', default='http://127.0.0.1:8000', help='API base URL')
    parser.add_argument('--db', default=None, help='SQLite database path')
    parser.add_argument('--poll', action='store_true', help='Run continuous polling loop')
    parser.add_argument('--once', action='store_true', help='Poll once and exit')
    parser.add_argument('--interval', type=float, default=2.0, help='Polling interval in seconds')
    parser.add_argument('--list', action='store_true', help='List all drafted invoices')
    parser.add_argument('--draft', type=str, default=None, help='Force draft an invoice for job_id')
    args = parser.parse_args()

    service = BillingAdapterService(api_base_url=args.api, db_path=args.db)
    init_db(args.db)

    if args.draft:
        logger.info(f'Drafting invoice for {args.draft}...')
        inv = service.draft_invoice_for_job(args.draft)
        if inv:
            print(f"Created: {inv['id']} - Total: ₹{inv['total_paise'] // 100}")
        else:
            print("Failed to draft invoice.")
        sys.exit(0)

    if args.list:
        invoices = get_invoices(args.db)
        print(f"Total drafted invoices: {len(invoices)}")
        for inv in invoices:
            print(f"- {inv['id']} | Job: {inv['job_id']} | ₹{inv['total_paise'] // 100} | Status: {inv['status']}")
        sys.exit(0)

    if args.once:
        logger.info('Performing single polling pass...')
        drafted = service.poll_once()
        logger.info(f'Processed pass. Drafted {len(drafted)} new invoices.')
        sys.exit(0)

    # Default or --poll: Continuous loop
    logger.info(f'Starting billing adapter poller against {args.api} (interval: {args.interval}s)...')
    try:
        while True:
            drafted = service.poll_once()
            if drafted:
                for inv in drafted:
                    logger.info(f"==> NEW INVOICE DRAFTED: {inv['id']} for job {inv['job_id']} (₹{inv['total_paise'] // 100})")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        logger.info('Billing adapter shutting down gracefully.')

if __name__ == '__main__':
    main()
