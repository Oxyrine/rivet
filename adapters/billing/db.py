"""Dedicated SQLite database for the billing adapter process."""
import json
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

DB_PATH = Path(__file__).resolve().parent / 'billing.db'

def get_connection(db_path: Path | str | None = None) -> sqlite3.Connection:
    target = Path(db_path) if db_path else DB_PATH
    conn = sqlite3.connect(str(target))
    conn.row_factory = sqlite3.Row
    return conn

def init_db(db_path: Path | str | None = None):
    conn = get_connection(db_path)
    with conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS sync_cursor (
            id TEXT PRIMARY KEY,
            last_seq INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS drafted_invoices (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL UNIQUE,
            machine_id TEXT NOT NULL,
            site_id TEXT NOT NULL,
            technician_id TEXT,
            parts_total_paise INTEGER NOT NULL,
            labour_total_paise INTEGER NOT NULL,
            total_paise INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'INR',
            status TEXT NOT NULL DEFAULT 'draft',
            lines_json TEXT NOT NULL,
            source_event_id TEXT,
            acceptance_type TEXT,
            created_at TEXT NOT NULL
        );
        """)
    conn.close()

def get_cursor(db_path: Path | str | None = None) -> int:
    init_db(db_path)
    conn = get_connection(db_path)
    cur = conn.cursor()
    cur.execute("SELECT last_seq FROM sync_cursor WHERE id = 'billing_events'")
    row = cur.fetchone()
    conn.close()
    return row['last_seq'] if row else 0

def set_cursor(seq: int, db_path: Path | str | None = None):
    init_db(db_path)
    conn = get_connection(db_path)
    now = datetime.now(timezone.utc).isoformat()
    with conn:
        conn.execute("""
        INSERT INTO sync_cursor (id, last_seq, updated_at)
        VALUES ('billing_events', ?, ?)
        ON CONFLICT(id) DO UPDATE SET last_seq = excluded.last_seq, updated_at = excluded.updated_at
        """, (seq, now))
    conn.close()

def save_invoice(invoice: dict, db_path: Path | str | None = None):
    init_db(db_path)
    conn = get_connection(db_path)
    with conn:
        conn.execute("""
        INSERT INTO drafted_invoices (
            id, job_id, machine_id, site_id, technician_id,
            parts_total_paise, labour_total_paise, total_paise,
            currency, status, lines_json, source_event_id, acceptance_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
            parts_total_paise = excluded.parts_total_paise,
            labour_total_paise = excluded.labour_total_paise,
            total_paise = excluded.total_paise,
            lines_json = excluded.lines_json,
            acceptance_type = excluded.acceptance_type
        """, (
            invoice['id'],
            invoice['job_id'],
            invoice['machine_id'],
            invoice['site_id'],
            invoice.get('technician_id'),
            invoice['parts_total_paise'],
            invoice['labour_total_paise'],
            invoice['total_paise'],
            invoice.get('currency', 'INR'),
            invoice.get('status', 'draft'),
            json.dumps(invoice['lines']),
            invoice.get('source_event_id'),
            invoice.get('acceptance_type'),
            invoice.get('created_at', datetime.now(timezone.utc).isoformat())
        ))
    conn.close()

def get_invoices(db_path: Path | str | None = None) -> list[dict]:
    init_db(db_path)
    conn = get_connection(db_path)
    cur = conn.cursor()
    cur.execute("SELECT * FROM drafted_invoices ORDER BY created_at DESC")
    rows = cur.fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d['lines'] = json.loads(d['lines_json'])
        result.append(d)
    return result

def get_invoice_by_job(job_id: str, db_path: Path | str | None = None) -> dict | None:
    init_db(db_path)
    conn = get_connection(db_path)
    cur = conn.cursor()
    cur.execute("SELECT * FROM drafted_invoices WHERE job_id = ?", (job_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d['lines'] = json.loads(d['lines_json'])
    return d
