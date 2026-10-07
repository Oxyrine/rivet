"""Unit and integration tests for the billing adapter."""
import pytest
from pathlib import Path
from adapters.billing.pricing import calculate_parts_cost, calculate_labour_cost, STANDARD_PART_COSTS_PAISE
from adapters.billing.db import init_db, save_invoice, get_invoices, get_invoice_by_job, get_cursor, set_cursor
from adapters.billing.service import BillingAdapterService

def test_pricing_calculations():
    # Parts: 1x HS-40 (240000 paise) + 2x O-RING (30000 paise)
    parts = {'HS-40': 1, 'O-RING': 2}
    total_parts, lines = calculate_parts_cost(parts)
    assert total_parts == 270000
    assert len(lines) == 2

    # Labour: 60 minutes @ 2500 paise/min = 150000 paise
    total_labour, labour_line = calculate_labour_cost(60)
    assert total_labour == 150000
    assert labour_line['line_total_paise'] == 150000

    # Total combined for J-2231
    assert total_parts + total_labour == 420000

def test_billing_sqlite_storage(tmp_path):
    test_db = tmp_path / 'test_billing.db'
    init_db(test_db)

    assert get_cursor(test_db) == 0
    set_cursor(42, test_db)
    assert get_cursor(test_db) == 42

    sample_inv = {
        'id': 'INV-J-2231',
        'job_id': 'J-2231',
        'machine_id': 'M-104',
        'site_id': 'site-a',
        'technician_id': 'priya',
        'parts_total_paise': 270000,
        'labour_total_paise': 150000,
        'total_paise': 420000,
        'currency': 'INR',
        'status': 'draft',
        'lines': [{'description': 'HS-40 x 1'}, {'description': 'Labour 60 min'}],
        'source_event_id': 'evt-000100',
        'acceptance_type': 'Verified',
    }

    save_invoice(sample_inv, test_db)
    invoices = get_invoices(test_db)
    assert len(invoices) == 1
    assert invoices[0]['id'] == 'INV-J-2231'
    assert invoices[0]['total_paise'] == 420000

    fetched = get_invoice_by_job('J-2231', test_db)
    assert fetched is not None
    assert fetched['total_paise'] == 420000
