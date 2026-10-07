'use client';
import React from 'react';
import { CheckCircle2, AlertCircle, Wrench, RefreshCw, Activity } from 'lucide-react';

export type MachineStatusType =
  | 'Running'
  | 'Fault detected'
  | 'Under repair'
  | 'Restored, awaiting confirmation'
  | 'Verified';

export interface StatusChipProps {
  status?: MachineStatusType | string;
  machine?: any;
  job?: any;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function deriveStatus(machine?: any, job?: any, overrideStatus?: string): MachineStatusType {
  if (overrideStatus && isValidStatus(overrideStatus)) {
    return overrideStatus as MachineStatusType;
  }

  // 1. If job is present, derive status from lifecycle
  if (job) {
    if (job.acceptance === 'Verified' || (job.state === 'closed' && job.acceptance === 'Verified')) {
      return 'Verified';
    }
    if (
      job.state === 'awaiting_acceptance' ||
      job.checkout_at ||
      (job.fix_source && job.fix_source !== 'unconfirmed') ||
      job.acceptance === 'Restored, awaiting confirmation'
    ) {
      return 'Restored, awaiting confirmation';
    }
    if (
      ['in_progress', 'started', 'on_site', 'work_started'].includes(job.state) ||
      job.started_at ||
      job.check_in_at ||
      job.on_site
    ) {
      return 'Under repair';
    }
    if (['pending_approval', 'approved', 'assigned'].includes(job.state)) {
      return 'Fault detected';
    }
  }

  // 2. Derive from machine status
  if (machine) {
    if (machine.status === 'Fault detected') return 'Fault detected';
    if (machine.status === 'Under repair') return 'Under repair';
    if (machine.status === 'Restored, awaiting confirmation') return 'Restored, awaiting confirmation';
    if (machine.status === 'Verified') return 'Verified';
    if (machine.status === 'Running') return 'Running';
  }

  return 'Running';
}

function isValidStatus(s: string): boolean {
  return ['Running', 'Fault detected', 'Under repair', 'Restored, awaiting confirmation', 'Verified'].includes(s);
}

export function StatusChip({ status, machine, job, className = '', size = 'md' }: StatusChipProps) {
  const currentStatus = deriveStatus(machine, job, status);

  const config: Record<MachineStatusType, { label: string; bg: string; color: string; border: string; icon: React.ReactNode }> = {
    'Running': {
      label: 'Running',
      bg: 'var(--panel-alt, #1b261f)',
      color: '#4ade80',
      border: '1px solid #166534',
      icon: <Activity size={13} color="#4ade80" />,
    },
    'Fault detected': {
      label: 'Fault detected',
      bg: '#2d1a1a',
      color: '#f87171',
      border: '1px solid #991b1b',
      icon: <AlertCircle size={13} color="#f87171" />,
    },
    'Under repair': {
      label: 'Under repair',
      bg: '#2e2015',
      color: '#fbbf24',
      border: '1px solid #b45309',
      icon: <Wrench size={13} color="#fbbf24" />,
    },
    'Restored, awaiting confirmation': {
      label: 'Restored, awaiting confirmation',
      bg: '#172554',
      color: '#60a5fa',
      border: '1px solid #1d4ed8',
      icon: <RefreshCw size={13} color="#60a5fa" />,
    },
    'Verified': {
      label: 'Verified',
      bg: '#064e3b',
      color: '#34d399',
      border: '1px solid #059669',
      icon: <CheckCircle2 size={13} color="#34d399" />,
    },
  };

  const item = config[currentStatus] || config['Running'];
  const pad = size === 'sm' ? '2px 8px' : size === 'lg' ? '6px 14px' : '4px 10px';
  const fSize = size === 'sm' ? '11px' : size === 'lg' ? '13px' : '12px';

  return (
    <span
      data-testid="status-chip"
      data-status={currentStatus}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: pad,
        fontSize: fSize,
        fontWeight: 600,
        fontFamily: 'var(--mono, monospace)',
        background: item.bg,
        color: item.color,
        border: item.border,
        borderRadius: '9999px',
        letterSpacing: '0.02em',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        transition: 'all 0.2s ease-in-out',
      }}
    >
      {item.icon}
      <span>{item.label}</span>
    </span>
  );
}
