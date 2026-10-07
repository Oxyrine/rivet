'use client';
import React from 'react';
import { ShiftJob, ShiftCommitment } from '@/lib/mock-shifts';
import { Clock, MapPin, Wrench, AlertTriangle, ShieldCheck, ChevronRight } from 'lucide-react';

interface JobCardProps {
  job: ShiftJob;
  commitments?: ShiftCommitment[];
  onSelect?: (job: ShiftJob) => void;
}

export function JobCard({ job, commitments = [], onSelect }: JobCardProps) {
  const timeCommitment = commitments.find((c) => c.type === 'TECH_TIME' && c.job_id === job.id);
  const slaCommitment = commitments.find((c) => c.type === 'SLA_WINDOW' && c.job_id === job.id);
  const partCommitments = commitments.filter((c) => c.type === 'PART_HOLD' && c.job_id === job.id);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      onClick={() => onSelect?.(job)}
      className="panel"
      style={{
        cursor: onSelect ? 'pointer' : 'default',
        borderLeft: job.priority === 'P1' ? '4px solid var(--accent)' : '4px solid var(--blue)',
        marginBottom: '14px',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600 }}>{job.id}</span>
            <span className={`badge ${job.priority === 'P1' ? 'amber' : 'green'}`}>{job.priority}</span>
            <span className="badge">{job.state.replace('_', ' ').toUpperCase()}</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Wrench size={16} /> {job.machine_id} &middot; <span style={{ fontWeight: 400, color: 'var(--muted)' }}>{job.fault.replace('_', ' ')}</span>
          </h3>
        </div>
        {onSelect && <ChevronRight size={18} style={{ color: 'var(--muted)', marginTop: '4px' }} />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginTop: '12px', fontSize: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--muted)' }}>
          <MapPin size={14} />
          <span>{job.site_id.toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--muted)' }}>
          <Clock size={14} />
          <span>Start: {formatTime(job.planned_start)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', fontWeight: 500 }}>
          <AlertTriangle size={14} />
          <span>SLA: {formatTime(job.deadline)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--muted)' }}>
          <ShieldCheck size={14} />
          <span>{job.duration_minutes} min est.</span>
        </div>
      </div>

      {/* Commitments & Held Parts preview */}
      {partCommitments.length > 0 && (
        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)', fontSize: '11px', fontFamily: 'var(--mono)' }}>
          <span style={{ color: 'var(--muted)' }}>HELD PARTS: </span>
          {partCommitments.map((p) => (
            <span key={p.id} className="badge" style={{ marginRight: '6px' }}>
              {p.resource} ({p.quantity || 1})
            </span>
          ))}
        </div>
      )}

      {timeCommitment && (
        <div style={{ marginTop: '6px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
          SCHEDULED SLOT: {formatTime(timeCommitment.starts_at)} – {formatTime(timeCommitment.ends_at)}
        </div>
      )}
    </div>
  );
}
