'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Clock, RotateCcw, Link2, KeyRound, Copy } from 'lucide-react';
import { api, useSession } from '@/lib/api';
import s from './team.module.css';

type Person = {
  user_id: string;
  role: string;
  sites: string[];
  technician_id?: string | null;
  email?: string | null;
  phone?: string | null;
  linked: boolean;
};

type DemoAccount = { user_id: string; role: string; email: string; password?: string; error?: string };

const ist = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Kolkata' });

export default function Team() {
  const { session } = useSession();
  const [people, setPeople] = useState<Person[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [clock, setClock] = useState('');
  const [controls, setControls] = useState<'unknown' | 'on' | 'off'>('unknown');
  const [when, setWhen] = useState('2026-10-07T09:02');
  const [armed, setArmed] = useState(false);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [showPasswords, setShowPasswords] = useState(false);
  const [removeArmed, setRemoveArmed] = useState(false);

  const isAdmin = session?.role === 'admin';

  const load = useCallback(async () => {
    try {
      setPeople(await api<Person[]>('/admin/users'));
      setClock((await api<{ now: string }>('/admin/clock')).now);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function act(key: string, work: () => Promise<string>) {
    setBusy(key);
    setError('');
    setMessage('');
    try {
      setMessage(await work());
      await load();
    } catch (e) {
      const text = (e as Error).message;
      setError(/disabled/i.test(text) ? 'Demo controls are off on this server. Set DEMO_CONTROLS=1 on the API to turn them on.' : text);
      if (/disabled/i.test(text)) setControls('off');
    } finally {
      setBusy('');
    }
  }

  const link = (p: Person) =>
    act('link:' + p.user_id, async () => {
      const email = (drafts[p.user_id] ?? p.email ?? '').trim();
      await api(`/admin/users/${p.user_id}/link`, { method: 'POST', body: JSON.stringify({ email }) });
      return `${p.user_id} is now linked to ${email.toLowerCase()}.`;
    });

  const setTime = () =>
    act('clock', async () => {
      const r = await api<{ now: string }>('/admin/clock', { method: 'POST', body: JSON.stringify({ set: `${when}:00+05:30` }) });
      setControls('on');
      return `Clock set to ${ist(r.now)} IST.`;
    });

  const advance = (seconds: number, label: string) =>
    act('clock', async () => {
      const r = await api<{ now: string }>('/admin/clock', { method: 'POST', body: JSON.stringify({ advance: seconds }) });
      setControls('on');
      return `Moved ${label}: ${ist(r.now)} IST.`;
    });

  const reset = () =>
    act('reset', async () => {
      await api('/admin/reset', { method: 'POST' });
      setArmed(false);
      setControls('on');
      return 'Demo data is back to the clean seed. People stay linked.';
    });

  const createLogins = () =>
    act('accounts', async () => {
      const r = await api<{ accounts: DemoAccount[]; skipped: string[] }>('/admin/demo-accounts', { method: 'POST', body: JSON.stringify({}) });
      setAccounts(r.accounts);
      setSkipped(r.skipped);
      const failed = r.accounts.filter(a => a.error).length;
      return failed ? `${r.accounts.length - failed} demo logins ready, ${failed} failed (see the list).` : `${r.accounts.length} demo logins ready. Copy the passwords now: they are not shown again.`;
    });

  const removeLogins = () =>
    act('remove-accounts', async () => {
      const r = await api<{ removed: string[]; kept: string[] }>('/admin/demo-accounts', { method: 'DELETE', body: JSON.stringify({}) });
      setAccounts([]);
      setSkipped([]);
      setRemoveArmed(false);
      return `Removed ${r.removed.length} demo logins.${r.kept.length ? ` ${r.kept.length} could not be removed.` : ''}`;
    });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Copied.');
    } catch {
      setError('Copying is blocked in this browser. Select the text and copy it by hand.');
    }
  };

  if (!session) {
    return (
      <div className="team-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">TEAM ACCESS</span>
            <h1>Who can sign in</h1>
          </div>
        </div>
        <div className="panel" style={{ color: 'var(--ink-2)' }}>
          Sign in as an administrator to manage team access and demo controls.
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="team-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">TEAM ACCESS</span>
            <h1>Who can sign in</h1>
          </div>
        </div>
        <div className="panel" style={{ color: 'var(--ink-2)' }}>
          Only administrators can manage access and demo controls. You are signed in as <strong>{session.role}</strong>.
        </div>
      </div>
    );
  }

  return (
    <div className="team-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">TEAM ACCESS</span>
          <h1>Who can sign in</h1>
          <p className="muted">
            A sign-in only works once its email is linked to a person here. The person carries the role and the sites they can see.
          </p>
        </div>
      </div>

      {error && <p role="alert" className="error-banner">{error}</p>}
      {message && <p role="status" className={s.ok}>{message}</p>}

      <section className="panel">
        <h2>Team directory & linked accounts</h2>
        <div className={s.scroller}>
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Sites</th>
                <th>Signs in with</th>
                <th aria-label="Action" style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {people.map(p => (
                <tr key={p.user_id}>
                  <td>
                    <strong>{p.user_id}</strong>
                    {p.technician_id && <small className={s.sub}>Field Technician</small>}
                  </td>
                  <td>
                    <span className="badge">{p.role}</span>
                  </td>
                  <td style={{ color: 'var(--ink-2)' }}>{p.sites.join(', ') || '—'}</td>
                  <td>
                    <input
                      type="email"
                      aria-label={`Email for ${p.user_id}`}
                      placeholder="name@company.com"
                      value={drafts[p.user_id] ?? p.email ?? ''}
                      onChange={e => setDrafts(d => ({ ...d, [p.user_id]: e.target.value }))}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className={p.linked ? 'secondary-button' : 'primary-button'}
                      disabled={
                        !!busy ||
                        !(drafts[p.user_id] ?? p.email ?? '').trim() ||
                        (drafts[p.user_id] ?? p.email ?? '').trim().toLowerCase() === (p.email ?? '').toLowerCase()
                      }
                      onClick={() => link(p)}
                    >
                      <Link2 size={14} />
                      {busy === 'link:' + p.user_id ? 'Linking…' : p.linked ? 'Update' : 'Link'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: '13px' }}>
          Create the person's sign-in in Supabase first (Authentication → Users → Add user), then link the same email here.
        </p>
      </section>

      <section className="panel">
        <h2>Demo logins</h2>
        <p className="muted" style={{ marginBottom: '16px' }}>
          One real sign-in for each role the demo walks through (coordinator, manager, supervisor, customer, storekeeper, auditor, and technicians ravi and priya),
          linked to its person automatically. They use plus-addresses of your own inbox, so a password reset can only reach you.
          Creating again gives every login a new password. Anyone already linked to a real address is left alone.
        </p>
        <div className="toolbar">
          <button className="primary-button" disabled={!!busy} onClick={createLogins}>
            <KeyRound size={15} /> {busy === 'accounts' ? 'Creating…' : accounts.length ? 'Create again (new passwords)' : 'Create demo logins'}
          </button>
          {accounts.length > 0 && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <input type="checkbox" checked={showPasswords} onChange={e => setShowPasswords(e.target.checked)} /> Show passwords
              </label>
              <button
                className="secondary-button"
                onClick={() => copy(accounts.filter(a => a.password).map(a => `${a.role} (${a.user_id})\t${a.email}\t${a.password}`).join('\n'))}
              >
                <Copy size={14} /> Copy all
              </button>
            </>
          )}
          {!removeArmed ? (
            <button className="secondary-button" style={{ marginLeft: 'auto' }} disabled={!!busy} onClick={() => setRemoveArmed(true)}>
              Remove demo logins…
            </button>
          ) : (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              Deletes the demo accounts and unlinks them.
              <button className="primary-button" style={{ background: 'var(--critical)', borderColor: 'var(--critical)' }} disabled={!!busy} onClick={removeLogins}>
                {busy === 'remove-accounts' ? 'Removing…' : 'Yes, remove'}
              </button>
              <button className="secondary-button" disabled={!!busy} onClick={() => setRemoveArmed(false)}>Cancel</button>
            </span>
          )}
        </div>
        {accounts.length > 0 && (
          <div className={s.scroller} style={{ marginTop: '16px' }} data-testid="demo-logins">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Person</th>
                  <th>Email</th>
                  <th>Password</th>
                  <th aria-label="Copy" />
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.user_id}>
                    <td><span className="badge">{a.role}</span></td>
                    <td><strong>{a.user_id}</strong></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{a.email}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
                      {a.error ? <span style={{ color: 'var(--critical)' }}>{a.error}</span> : showPasswords ? a.password : '••••••••••••'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {a.password && (
                        <button className="secondary-button" aria-label={`Copy login for ${a.user_id}`} onClick={() => copy(`${a.email}\t${a.password}`)}>
                          <Copy size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {skipped.length > 0 && (
          <p className="muted" style={{ fontSize: '13px', marginTop: '12px' }}>
            Skipped because they already have a real sign-in linked: {skipped.join(', ')}.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Demo controls & time travel</h2>
        <p className="muted" style={{ marginBottom: '16px' }}>
          For rehearsals and the stage demo. The server clock is <strong>{clock ? `${ist(clock)} IST` : '…'}</strong>
          {controls === 'off' && ' (real time: controls are off)'}.
        </p>
        <div className="toolbar">
          <input
            type="datetime-local"
            aria-label="Set the clock (India time)"
            value={when}
            onChange={e => setWhen(e.target.value)}
          />
          <button className="primary-button" disabled={!!busy} onClick={setTime}>
            <Clock size={15} /> Set clock (IST)
          </button>
          <button className="secondary-button" disabled={!!busy} onClick={() => advance(600, '10 minutes forward')}>
            +10 min
          </button>
          <button className="secondary-button" disabled={!!busy} onClick={() => advance(3600, '1 hour forward')}>
            +1 hour
          </button>
        </div>
        <div className="toolbar" style={{ marginTop: '16px' }}>
          {!armed ? (
            <button className="secondary-button" style={{ color: 'var(--critical)' }} disabled={!!busy} onClick={() => setArmed(true)}>
              <RotateCcw size={15} /> Reset demo data…
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--critical-surface)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(179,0,0,0.2)' }}>
              <span style={{ color: 'var(--critical)', fontSize: '13px', fontWeight: 500 }}>
                This erases every request, job and proof record and restores the clean seed.
              </span>
              <button
                className="primary-button"
                style={{ background: 'var(--critical)', borderColor: 'var(--critical)' }}
                disabled={!!busy}
                onClick={reset}
              >
                {busy === 'reset' ? 'Resetting…' : 'Yes, erase & reset'}
              </button>
              <button className="secondary-button" disabled={!!busy} onClick={() => setArmed(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
