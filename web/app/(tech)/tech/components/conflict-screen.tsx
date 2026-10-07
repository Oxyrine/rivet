'use client';
import React from 'react';
import { AlertTriangle, Wrench, Package, Truck, Ban, AlertCircle, FileText, CheckCircle2, ArrowRight } from 'lucide-react';

export type ConflictCode =
  | 'JOB_REASSIGNED'
  | 'PART_CONFLICT'
  | 'VAN_STOCK'
  | 'JOB_CANCELLED'
  | 'EVIDENCE_MISSING';

export interface ConflictScreenProps {
  code: ConflictCode;
  jobId?: string;
  data?: {
    // JOB_REASSIGNED
    reassignedTo?: string;       // e.g. "Priya"
    reassignedAt?: string;       // e.g. "10:15"
    taskLogsCount?: number;
    photosCount?: number;
    partScansCount?: number;
    // PART_CONFLICT
    heldForJob?: string;         // e.g. "J-2240"
    partNumber?: string;         // e.g. "HS-40"
    // VAN_STOCK
    vanCovered?: boolean;
    vanQuantity?: number;
    // JOB_CANCELLED
    cancellationReason?: string;
    // EVIDENCE_MISSING
    missingItems?: string[];
    checklistTotal?: number;
  };
  onViewEvidence?: () => void;
  onDismiss?: () => void;
  onReportDropout?: () => void;
}

export function ConflictScreen({
  code,
  jobId = 'J-2236',
  data = {},
  onViewEvidence,
  onDismiss,
  onReportDropout,
}: ConflictScreenProps) {
  return (
    <div
      data-testid="conflict-card"
      data-conflict-code={code}
      className="panel"
      style={{
        borderLeft: '4px solid var(--accent)',
        background: '#fffdfa',
        padding: '24px',
        maxWidth: '580px',
        margin: '0 auto 20px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      }}
    >
      {/* 1. JOB_REASSIGNED SCREEN */}
      {code === 'JOB_REASSIGNED' && (
        <div data-testid="screen-job-reassigned">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--red)', marginBottom: '10px' }}>
            <AlertTriangle size={18} />
            <h3 style={{ margin: 0, fontSize: '15px', fontFamily: 'var(--mono)' }}>CONFLICT: JOB REASSIGNED</h3>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 500, margin: '0 0 10px' }}>
            This job moved to {data.reassignedTo || 'Priya'} at {data.reassignedAt || '10:15'}. Your notes are attached.
          </p>
          <div style={{ background: 'var(--panel-alt)', padding: '12px 14px', borderRadius: '3px', fontSize: '12px', fontFamily: 'var(--mono)', marginBottom: '16px' }}>
            Your evidence is preserved: {data.taskLogsCount || 4} task logs &middot; {data.photosCount || 3} photos &middot; {data.partScansCount || 2} part scans
            <div style={{ color: 'var(--red)', marginTop: '4px' }}>Rejected: completion status update</div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              data-testid="btn-view-evidence"
              className="secondary-button"
              onClick={onViewEvidence}
            >
              [ View evidence ]
            </button>
            {onDismiss && (
              <button type="button" className="quiet-button" onClick={onDismiss}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. PART_CONFLICT SCREEN */}
      {code === 'PART_CONFLICT' && (
        <div data-testid="screen-part-conflict">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', marginBottom: '10px' }}>
            <Package size={18} />
            <h3 style={{ margin: 0, fontSize: '15px', fontFamily: 'var(--mono)' }}>REJECTION: PART CONFLICT</h3>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 500, margin: '0 0 10px' }}>
            This part is held for {data.heldForJob || 'J-2240'}. Coordinator asked to transfer it.
          </p>
          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 16px' }}>
            Scan recorded as pending evidence. The part will be consumed only after a coordinator approves a CommitmentTransferred from the other job. No hold is silently taken.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <span className="badge amber">TRANSFER REQUEST PENDING</span>
            {onDismiss && (
              <button type="button" className="quiet-button" onClick={onDismiss}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. VAN STOCK SCREEN */}
      {code === 'VAN_STOCK' && (
        <div data-testid="screen-van-stock">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--green)', marginBottom: '10px' }}>
            <Truck size={18} />
            <h3 style={{ margin: 0, fontSize: '15px', fontFamily: 'var(--mono)' }}>VAN INVENTORY RECORD</h3>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 500, margin: '0 0 8px' }}>
            Logged from van stock
          </p>
          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 14px' }}>
            Verified against technician van ledger ({data.vanQuantity || 2} units available). Variance auto-clears under weekly allotment.
          </p>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span className="badge green">VAN LEDGER CONFIRMED</span>
            {onDismiss && (
              <button type="button" className="quiet-button" onClick={onDismiss}>
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. JOB_CANCELLED SCREEN */}
      {code === 'JOB_CANCELLED' && (
        <div data-testid="screen-job-cancelled">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', marginBottom: '10px' }}>
            <Ban size={18} />
            <h3 style={{ margin: 0, fontSize: '15px', fontFamily: 'var(--mono)' }}>JOB CANCELLED</h3>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 500, margin: '0 0 8px' }}>
            Cancellation reason: {data.cancellationReason || 'Customer facility maintenance shutdown postponed by plant head.'}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 14px' }}>
            Commands for this job have been marked as cancelled. Any physical holds will be returned to store availability.
          </p>
          {onDismiss && (
            <button type="button" className="secondary-button" onClick={onDismiss}>
              Return to Shift List
            </button>
          )}
        </div>
      )}

      {/* 5. EVIDENCE_MISSING SCREEN */}
      {code === 'EVIDENCE_MISSING' && (
        <div data-testid="screen-evidence-missing">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--red)', marginBottom: '10px' }}>
            <AlertCircle size={18} />
            <h3 style={{ margin: 0, fontSize: '15px', fontFamily: 'var(--mono)' }}>CLOSURE BLOCKED: EVIDENCE MISSING</h3>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 500, margin: '0 0 10px' }}>
            Checklist with the gaps highlighted:
          </p>
          <div style={{ background: '#fff0ee', border: '1px solid #f8d7da', padding: '14px', borderRadius: '3px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--red)', marginBottom: '8px' }}>
              MANDATORY PROOFS REQUIRED BEFORE ACCEPTANCE:
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text)' }}>
              {(data.missingItems || ['Before-repair photo of leak point', 'Final calibrated pressure reading', 'Store issue voucher reconciliation']).map((gap, i) => (
                <li key={i} style={{ marginBottom: '4px' }}>
                  <b style={{ color: 'var(--red)' }}>MISSING:</b> {gap}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="primary-button" onClick={onDismiss}>
              Supply Missing Evidence &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Dropout Action Section */}
      {onReportDropout && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '20px', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
            EMERGENCY EXCEPTION REPORTING
          </span>
          <button
            type="button"
            data-testid="conflict-report-dropout-btn"
            className="quiet-button"
            style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
            onClick={onReportDropout}
          >
            Report Dropout
          </button>
        </div>
      )}
    </div>
  );
}
