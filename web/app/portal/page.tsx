'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowUpRight, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { api, useSession } from '@/lib/api';
import { ReconciliationTable } from '@/components/reconciliation-table';
import { StatusLabel } from '@/components/ui/status-label';

export default function Portal() {
  const { session } = useSession();
  const [jobs, setJobs] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState('labour');
  const [presence, setPresence] = useState(false);
  const [recon, setRecon] = useState<any>(null);

  const refresh = async () => {
    const data = await api<any>('/jobs');
    const list = Array.isArray(data) ? data : data.items || data.jobs || [];
    setJobs(list);
    // The control room links here with ?job=J-xxxx; open that job when the person can see it.
    const wanted = new URLSearchParams(window.location.search).get('job');
    if (!selected && list.length) setSelected(list.find((j: any) => j.id === wanted)?.id ?? list[0].id);
  };

  useEffect(() => {
    if (session) refresh().catch(e => setMessage(e.message));
  }, [session]);

  useEffect(() => {
    if (selected && session) {
      api<any>(`/jobs/${selected}`).then(setDetail).catch(e => setMessage(e.message));
    }
  }, [selected, session]);

  // Results show as a toast in view: the page is long, so a message at the bottom goes unseen.
  const say = (text: string, isError = false) => {
    setMessage(text);
    setFailed(isError);
  };
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  const act = async (path: string, body: any = {}, done = 'Recorded in the audit history.', notFound = '') => {
    setBusy(true);
    try {
      const result = await api<any>(path, { method: 'POST', body: JSON.stringify(body) });
      await refresh();
      setDetail(await api<any>(`/jobs/${selected}`));
      say(done);
      return result;
    } catch (e: any) {
      say(e.status === 404 && notFound ? notFound : e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const stateLabel: Record<string, string> = { PROPOSED: 'Awaiting your confirmation', HELD: 'Confirmed', FULFILLED: 'Fulfilled' };

  const j = detail?.job || detail;
  const blocked = !!j && (j.state === 'closure_blocked' || recon?.outcome === 'Unexplained' || !!recon?.rows?.some((r: any) => r.outcome === 'Unconfirmed'));

  return (
    <div className="portal-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CUSTOMER WORKSPACE</span>
          <h1>Your service, on record.</h1>
          <p className="muted">Track commitments, confirm access, and review the evidence behind completion.</p>
        </div>
        <Link className="secondary-button" href="/verify">
          Verify a record <ArrowUpRight size={15} />
        </Link>
      </div>

      <div className="panel">
        <h2>Service requests</h2>
        <div className="toolbar">
          <select value={selected} onChange={e => setSelected(e.target.value)} aria-label="Select service request">
            {jobs.map(x => (
              <option key={x.id} value={x.id}>
                {x.id} · {x.machine_id} · {x.state?.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <button className="primary-button" onClick={() => act('/requests', { machine_id: 'M-104', fault: 'hydraulic_leak', description: 'Urgent hydraulic leak' })}>
            Request M-104 service
          </button>
        </div>
      </div>

      {j && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <small>Equipment</small>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <h2>{j.machine_id}</h2>
                <StatusLabel tone={j.state === 'closed' || j.state === 'completed' ? 'positive' : j.state === 'closure_blocked' ? 'critical' : 'warning'}>
                  {j.state?.replaceAll('_', ' ')}
                </StatusLabel>
              </div>
              <span>Site: {j.site_id}</span>
            </div>

            <div className="stat-card">
              <small>Service stage</small>
              <h2>{j.state?.replaceAll('_', ' ')}</h2>
              <span>Priority: {j.priority}</span>
            </div>

            <div className="stat-card">
              <small>Customer acceptance</small>
              <h2>{j.acceptance || 'Pending'}</h2>
              <span>{j.reconciliation?.outcome || 'Awaiting report'}</span>
            </div>
          </div>

          <section className="panel">
            <h2>Site commitments</h2>
            <p className="muted" style={{ marginBottom: '16px' }}>
              Customer-confirmed access and permit obligations support an accurate service timeline.
            </p>
            {j.commitments?.filter((c: any) => ['ACCESS_WINDOW', 'SHUTDOWN_WINDOW', 'PERMIT_TO_WORK'].includes(c.type)).map((c: any) => (
              <div className="toolbar" key={c.id} style={{ background: 'var(--surface-sunken)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                <span style={{ fontWeight: 500, marginRight: 'auto' }}>
                  {c.type.replaceAll('_', ' ')} · <span style={{ color: 'var(--ink-2)' }}>{stateLabel[c.state] || c.state}</span>
                </span>
                <button className="secondary-button" disabled={busy || c.state !== 'PROPOSED'} onClick={() => act(`/customer-commitments/${c.id}/confirm`, {}, `${c.type.replaceAll('_', ' ')} confirmed.`)}>Confirm</button>
                <button className="secondary-button" disabled={busy || c.state === 'FULFILLED'} onClick={() => act(`/customer-commitments/${c.id}/fulfil`, {}, `${c.type.replaceAll('_', ' ')} marked fulfilled.`)}>Fulfilled</button>
              </div>
            ))}
            <div className="toolbar" style={{ marginTop: '16px' }}>
              <button className="secondary-button" disabled={busy} onClick={() => act(`/pauses/pause:${selected}/confirm`, {}, 'Permit pause confirmed.', 'No permit pause is recorded yet. One starts when the technician waits on the permit.')}>Confirm recorded permit pause</button>
              <button className="secondary-button" disabled={busy || !!j.machine_running_at} onClick={() => act(`/jobs/${selected}/machine-running`, {}, 'Machine running confirmed.')}>Confirm machine running</button>
            </div>
            <p className="muted" style={{ fontSize: '13px', marginTop: '12px' }}>
              Machine running: {j.machine_running_at ? `confirmed ${new Date(j.machine_running_at).toLocaleString()}` : 'not confirmed yet'}
            </p>
          </section>

          <section className="panel">
            <h2>Completion evidence</h2>
            <p style={{ marginBottom: '16px' }}>
              Report fingerprint: <code>{j.report_hash || 'No submitted report'}</code>
            </p>
            {j.report && (
              <div style={{ marginBottom: '20px' }}>
                <ReconciliationTable job={j} onResult={setRecon} />
                {j.report.notes && <p style={{ marginTop: '12px', fontStyle: 'italic' }}>Note: {j.report.notes}</p>}
              </div>
            )}

            <div style={{ margin: '20px 0', padding: '16px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px', fontWeight: 500 }}>
                <input type="checkbox" checked={presence} onChange={e => setPresence(e.target.checked)} />
                <span>I confirm the technician was present at this site.</span>
              </label>

              <div className="toolbar">
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="Supervisor PIN (e.g. 246810)"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  style={{ width: '220px' }}
                />
                <button
                  className="primary-button"
                  disabled={!j.report_hash || blocked}
                  onClick={() => act(`/jobs/${selected}/accept`, { pin, device_id: session?.device_id, report_hash: j.report_hash, confirm_presence: presence })}
                >
                  <ShieldCheck size={16} /> Accept this exact report
                </button>
                <Link className="secondary-button" href={`/verify?job=${selected}`}>
                  Check signed history
                </Link>
              </div>
            </div>

            {blocked && (
              <div role="status" className="error-banner" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <Lock size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Acceptance is locked.</strong> The report disagrees with, or lacks, records the technician does not write. It unlocks once the lines marked in the table above are corrected or a manager signs off.
                </div>
              </div>
            )}
            <p className="muted" style={{ fontSize: '13px', marginTop: '12px' }}>
              Acceptance requires the registered supervisor device. Missing fix confirmation remains visible in audit trail.
            </p>
          </section>

          <section className="panel">
            <h2>Raise a named-line dispute</h2>
            <p className="muted" style={{ marginBottom: '16px' }}>
              Only the named lines are held. Other invoice lines remain payable.
            </p>
            <div className="toolbar">
              <select value={line} onChange={e => setLine(e.target.value)} aria-label="Select line to dispute">
                {['labour', 'sla', 'presence', 'fix', ...Object.keys(j.report?.parts || {})].map(x => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
              <button className="secondary-button" onClick={() => act(`/jobs/${selected}/dispute`, { lines: [line], reason: 'Customer requests review' })}>
                Dispute selected line
              </button>
            </div>
          </section>
        </>
      )}

      {message && (
        <p
          className="notice"
          role="status"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 50,
            maxWidth: 420,
            margin: 0,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            ...(failed ? { borderColor: 'var(--critical, #b3261e)', color: 'var(--critical, #b3261e)' } : {}),
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
