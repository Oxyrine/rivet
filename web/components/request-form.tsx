'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSummary } from '@/lib/use-summary';

// The two faults the planner knows how to staff (skill, duration, parts). Anything else would be guessed at.
export const FAULTS = [
  ['hydraulic_leak', 'Hydraulic leak'],
  ['gearbox_overhaul', 'Gearbox overhaul'],
] as const;

export type RequestResult = { job_id: string; id?: string; duplicate?: boolean; auto_approved?: boolean };

/** Report a fault on any machine this person can see. Creates the request; the caller decides what to show next. */
export function RequestForm({ onDone, onError }: { onDone: (result: RequestResult, message: string) => void; onError: (message: string) => void }) {
  const { summary } = useSummary();
  const machines = (summary?.machines ?? []).filter(m => m.eligible !== false);
  const [machine, setMachine] = useState('');
  const [fault, setFault] = useState<string>(FAULTS[0][0]);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!machine && machines.length) setMachine(machines.find(m => m.id === 'M-104')?.id ?? machines[0].id);
  }, [machines, machine]);

  const site = (id: string) => summary?.sites?.find(s => s.id === id)?.name ?? id;

  async function submit() {
    setBusy(true);
    try {
      const result = await api<RequestResult>('/requests', { method: 'POST', body: JSON.stringify({ machine_id: machine, fault, description: description.trim(), source: 'portal' }) });
      setDescription('');
      onDone(
        result,
        result.duplicate
          ? `${machine} already has an open ${fault.replaceAll('_', ' ')} request: ${result.job_id}.`
          : result.auto_approved
            ? `Request ${result.job_id} approved automatically. It now waits for a technician to be assigned.`
            : `Request ${result.job_id} sent. A coordinator will review it.`
      );
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="toolbar" data-testid="request-form">
      <select value={machine} onChange={e => setMachine(e.target.value)} aria-label="Machine">
        {machines.map(m => (
          <option key={m.id} value={m.id}>{m.id} · {m.name ?? 'Machine'} · {site(m.site_id)}</option>
        ))}
      </select>
      <select value={fault} onChange={e => setFault(e.target.value)} aria-label="Fault">
        {FAULTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What are you seeing? (optional)" aria-label="Description" maxLength={300} style={{ flex: '1 1 220px', minWidth: 0 }} />
      <button className="primary-button" disabled={busy || !machine} onClick={submit}>{busy ? 'Sending…' : 'Request service'}</button>
    </div>
  );
}
