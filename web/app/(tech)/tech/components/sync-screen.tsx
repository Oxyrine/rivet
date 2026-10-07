'use client';
import React from 'react';
import { Check, AlertCircle } from 'lucide-react';

export interface SyncScreenProps {
  mode: 'offline' | 'complete' | 'conflict';
  lastSyncTime?: string;          // e.g. "10:02"
  actionsQueued?: number;         // e.g. 7
  photosPending?: number;         // e.g. 3
  commandsAccepted?: number;      // e.g. 7
  commandsTotal?: number;         // e.g. 7
  photosUploaded?: number;        // e.g. 3
  photosTotal?: number;           // e.g. 3
  duplicatesIgnored?: number;     // e.g. 0
  sequenceGapsDetected?: number;  // e.g. 0
  conflictDetails?: {
    jobId: string;
    newTechnician: string;
    movedAt: string;              // e.g. "10:15"
    taskLogsCount: number;        // e.g. 4
    photosCount: number;          // e.g. 3
    partScansCount: number;       // e.g. 2
    rejectedMessage: string;      // e.g. "completion status update"
  };
  onViewEvidence?: () => void;
  onSyncNow?: () => void;
}

export function SyncScreen({
  mode,
  lastSyncTime = '10:02',
  actionsQueued = 7,
  photosPending = 3,
  commandsAccepted = 7,
  commandsTotal = 7,
  photosUploaded = 3,
  photosTotal = 3,
  duplicatesIgnored = 0,
  sequenceGapsDetected = 0,
  conflictDetails,
  onViewEvidence,
  onSyncNow,
}: SyncScreenProps) {
  return (
    <div
      data-testid="sync-screen-container"
      className="panel"
      style={{
        fontFamily: 'var(--mono)',
        background: '#fbfaf6',
        border: '1px solid var(--border)',
        padding: '24px',
        maxWidth: '560px',
        margin: '0 auto 24px',
        borderRadius: '3px',
      }}
    >
      {/* 1. OFFLINE BLOCK (Spec p.15) */}
      {mode === 'offline' && (
        <div data-testid="spec-offline-block">
          <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.8px', color: 'var(--accent)', marginBottom: '12px' }}>
            OFFLINE &middot; last sync {lastSyncTime}
          </div>
          <div style={{ fontSize: '14px', marginBottom: '4px' }}>
            {actionsQueued} actions queued
          </div>
          <div style={{ fontSize: '14px', marginBottom: '14px', color: 'var(--muted)' }}>
            {photosPending} photos pending
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--green)' }}>
              <span>✓</span>
              <span style={{ color: 'var(--text)' }}>Check-in recorded</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--green)' }}>
              <span>✓</span>
              <span style={{ color: 'var(--text)' }}>Part scan recorded</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--green)' }}>
              <span>✓</span>
              <span style={{ color: 'var(--text)' }}>Evidence timestamped</span>
            </div>
          </div>
          {onSyncNow && (
            <div style={{ marginTop: '20px' }}>
              <button type="button" className="secondary-button" onClick={onSyncNow} style={{ width: '100%', justifyContent: 'center' }}>
                Attempt Replay Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. SYNC COMPLETE BLOCK (Spec p.15) */}
      {mode === 'complete' && (
        <div data-testid="spec-sync-complete-block">
          <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.8px', color: 'var(--green)', marginBottom: '12px' }}>
            SYNC COMPLETE
          </div>
          <div style={{ fontSize: '14px', marginBottom: '4px' }}>
            {commandsAccepted} of {commandsTotal} commands accepted
          </div>
          <div style={{ fontSize: '14px', marginBottom: '4px' }}>
            {photosUploaded} of {photosTotal} photos uploaded
          </div>
          <div style={{ fontSize: '14px', marginBottom: '4px', color: 'var(--muted)' }}>
            {duplicatesIgnored} duplicates ignored
          </div>
          <div style={{ fontSize: '14px', color: 'var(--muted)' }}>
            {sequenceGapsDetected} sequence gaps detected
          </div>
        </div>
      )}

      {/* 3. CONFLICT BLOCK (Spec p.15) */}
      {mode === 'conflict' && conflictDetails && (
        <div data-testid="spec-conflict-block">
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--red)', marginBottom: '10px' }}>
            CONFLICT: {conflictDetails.jobId} moved to {conflictDetails.newTechnician} at {conflictDetails.movedAt}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '8px' }}>
            Your evidence is preserved: {conflictDetails.taskLogsCount} task logs &middot; {conflictDetails.photosCount} photos &middot; {conflictDetails.partScansCount} part scans
          </div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
            Rejected: {conflictDetails.rejectedMessage}
          </div>
          <div>
            <button
              type="button"
              className="quiet-button"
              data-testid="view-evidence-btn"
              onClick={onViewEvidence}
              style={{ padding: '6px 12px', border: '1px solid var(--border)', background: 'var(--panel)' }}
            >
              [ View evidence ]
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
