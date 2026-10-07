'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Share2, Download, CheckCircle2, Shield } from 'lucide-react';
import { api, useSession } from '@/lib/api';
import s from './passport.module.css';

const STATE: Record<string, { label: string; note: string; tone: string }> = {
  'Verified': { label: 'Verified', note: 'Accepted with a PIN on the supervisor’s registered phone', tone: 'good' },
  'Deemed accepted': { label: 'Deemed accepted', note: 'Not reviewed by the customer', tone: 'warn' },
  'Accepted by email': { label: 'Accepted by email', note: 'Never counts as verified', tone: 'warn' },
  'Accepted on paper': { label: 'Accepted on paper', note: 'Never counts as verified', tone: 'warn' },
  'Accepted, fix not independently confirmed': { label: 'Accepted, fix not independently confirmed', note: 'No sensor or supervisor running confirmation', tone: 'warn' },
  'Disputed': { label: 'Disputed', note: 'Named lines are held', tone: 'bad' },
  'Pending': { label: 'Awaiting acceptance', note: '', tone: 'plain' },
};

const day = (v?: string) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }) : '—';
const words = (v: string) => v.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
const download = (value: unknown, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  a.download = name;
  a.click();
};

export default function Passport() {
  const { session } = useSession();
  const [machines, setMachines] = useState<any[]>([]);
  const [machine, setMachine] = useState('M-104');
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get('machine');
    if (linked) setMachine(linked);
  }, []);

  useEffect(() => {
    if (session) api<any>('/dashboard/summary').then(d => setMachines(d.machines || [])).catch(e => setMessage(e.message));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    setData(null);
    setMessage('');
    api<any>(`/machines/${machine}/passport`).then(setData).catch(e => setMessage(e.message));
  }, [session, machine]);

  const jobs = useMemo(() => [...(data?.jobs || [])].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at))), [data]);
  const sealed = jobs.filter((j: any) => j.sla);
  const count = (label: string) => jobs.filter((j: any) => j.acceptance === label).length;
  const head = [...(data?.events || [])].reverse().find((e: any) => e.machine_hash)?.machine_hash;
  const lastClosed = jobs.find((j: any) => j.state === 'closed' || j.report_hash);

  return (
    <div className="passport-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MACHINE SERVICE PASSPORT</span>
          <h1>{data ? `${data.machine.id} · ${data.machine.name || data.machine.type || 'Equipment'}` : machine}</h1>
          <p className="muted">Every entry shows how it was accepted. Only a PIN on the registered phone counts as verified.</p>
        </div>
        <label className={s.picker}>
          Machine
          <select value={machine} onChange={e => setMachine(e.target.value)} aria-label="Select machine">
            {(machines.length ? machines : [{ id: machine }]).map((m: any) => (
              <option key={m.id} value={m.id}>{m.id}{m.name ? ` · ${m.name}` : ''}</option>
            ))}
          </select>
        </label>
      </div>

      {!session && (
        <div className="panel" style={{ color: 'var(--ink-2)' }}>
          Sign in with the session bar to open a machine’s passport. Customers see only machines at their own sites.
        </div>
      )}

      {message && <p role="alert" className={s.error}>{message}</p>}

      {data && (
        <>
          <section className={s.summary} aria-label="Service summary">
            <div>
              <strong>{sealed.filter((j: any) => j.sla.met).length}<small> of {sealed.length}</small></strong>
              <span>SLA met</span>
            </div>
            <div>
              <strong className={s.good}>{count('Verified')}</strong>
              <span>Verified</span>
            </div>
            <div>
              <strong className={s.warn}>{count('Deemed accepted')}</strong>
              <span>Deemed accepted</span>
            </div>
            <div>
              <strong className={s.bad}>{count('Disputed')}</strong>
              <span>Disputed</span>
            </div>
            <div>
              <strong>{data.machine.status}</strong>
              <span>Status now</span>
            </div>
          </section>

          <section className="panel">
            <h2>Service history timeline</h2>
            <ol className={s.entries}>
              {jobs.map((j: any) => {
                const st = STATE[j.acceptance] || { label: j.acceptance, note: '', tone: 'plain' };
                const recon = j.reconciliation?.outcome;
                return (
                  <li key={j.id}>
                    <time>{day(j.restored_at || j.created_at)}</time>
                    <div className={s.what}>
                      <b>{words(j.fault)}</b>
                      <small>{j.id} · {j.priority}{j.technician_id ? ` · ${words(j.technician_id)}` : ''}</small>
                    </div>
                    <div className={s.how}>
                      <span className={`${s.chip} ${s[st.tone] || ''}`}>{st.label}</span>
                      {st.note && <small>{st.note}</small>}
                    </div>
                    <div className={s.sla}>
                      {j.sla ? (
                        <>
                          <b className={j.sla.met ? s.good : s.bad}>
                            {j.sla.met ? `SLA met by ${j.sla.margin_minutes} min` : `SLA missed by ${Math.ceil(j.sla.late_seconds / 60)} min`}
                          </b>
                          {recon && <small>{recon === 'Explained variance' ? '1 explained variance' : recon === 'Clean' ? 'Clean reconciliation' : recon}</small>}
                        </>
                      ) : (
                        <small>SLA open</small>
                      )}
                    </div>
                  </li>
                );
              })}
              {!jobs.length && <li className={s.none}>No service has been recorded for this machine yet.</li>}
            </ol>

            <div className={s.actions}>
              {lastClosed && (
                <Link className="primary-button" href={`/verify?job=${lastClosed.id}`}>
                  <Shield size={16} /> Verify history
                </Link>
              )}
              <button
                className="secondary-button"
                onClick={() => {
                  navigator.clipboard?.writeText(`${location.origin}/passport?machine=${machine}`).then(() => setMessage('Passport link copied. The recipient still needs access to see it.'));
                }}
              >
                <Share2 size={15} /> Share passport
              </button>
              <button className="secondary-button" onClick={() => download(data, `${machine}-passport.json`)}>
                <Download size={15} /> Export JSON
              </button>
            </div>

            {head && (
              <p className={s.head}>
                Machine chain head <code>{head.slice(0, 12)}…{head.slice(-8)}</code> · {data.events.length} recorded events
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
