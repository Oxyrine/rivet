'use client';
import {useState} from 'react';
import {api,useSession} from '@/lib/api';
import {hostedAuth,supabase} from '@/lib/supabase';

import { useState } from 'react';
import { api, useSession } from '@/lib/api';
import { hostedAuth, supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

/** Hosted sign-in through Supabase (password, or a one-time code by email). The API then decides which role and sites the account gets. */
function HostedSignIn({ adopt, onDone }: { adopt: (token: string) => Promise<unknown>; onDone: () => void }) {
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  
  async function run(work: () => Promise<void>) { setBusy(true); setError(''); try { await work(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }
  
  async function finish(token: string) {
    try { await adopt(token); onDone(); }
    catch (err) { await supabase().auth.signOut(); throw err; }
  }
  
  const withPassword = () => run(async () => {
    const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) throw error ?? new Error('Sign-in failed.');
    await finish(data.session.access_token);
  });
  
  const send = () => run(async () => {
    const { error } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    if (error) throw error;
    setSent(true);
  });
  
  const verify = () => run(async () => {
    const { data, error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error || !data.session) throw error ?? new Error('That code was not accepted.');
    await finish(data.session.access_token);
  });
  
  const useCode = mode === 'code';
  
  return (
    <form className="login-popover panel" style={{position: 'absolute', right: 0, top: '48px', width: '300px', zIndex: 50, background: 'var(--surface)', padding: '24px', borderRadius: '8px', boxShadow: '0 12px 35px rgba(32,40,36,0.15)', border: '1px solid var(--line)'}} onSubmit={e => { e.preventDefault(); void (useCode ? (sent ? verify() : send()) : withPassword()); }}>
      <h3 style={{marginBottom: '16px'}}>Sign in to your workspace</h3>
      <label style={{display: 'block', marginBottom: '12px', fontSize: '12px', color: 'var(--ink-2)'}}>Work email<input type="email" required autoComplete="username" value={email} disabled={useCode && sent} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={{marginTop: '6px'}}/></label>
      {!useCode && <label style={{display: 'block', marginBottom: '16px', fontSize: '12px', color: 'var(--ink-2)'}}>Password<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} style={{marginTop: '6px'}}/></label>}
      {useCode && sent && <label style={{display: 'block', marginBottom: '16px', fontSize: '12px', color: 'var(--ink-2)'}}>6-digit code<input value={code} onChange={e => setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required autoFocus style={{marginTop: '6px'}}/></label>}
      {useCode && sent && <Button type="button" variant="quiet" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(''); }}>Use a different email</Button>}
      {error && <div role="alert" style={{padding: '12px', background: 'var(--surface-sunken)', color: 'var(--critical)', borderRadius: '4px', marginBottom: '16px', fontSize: '13px'}}>{error}</div>}
      <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px'}}>
        <Button variant="primary" type="submit" busy={busy} disabled={!email || (!useCode && !password) || (useCode && sent && !code)}>
          {useCode ? (sent ? 'Sign in →' : 'Email me a code →') : 'Sign in →'}
        </Button>
        <Button type="button" variant="quiet" disabled={busy} onClick={() => { setMode(useCode ? 'password' : 'code'); setSent(false); setCode(''); setError(''); }}>
          {useCode ? 'Use a password instead' : 'Email me a code instead'}
        </Button>
      </div>
    </form>
  );
}

export function SessionBar() {
  const { session, login, logout, adopt } = useSession();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState('coordinator');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  
  if (session) {
    const roleName = session.role.charAt(0).toUpperCase() + session.role.slice(1);
    return (
      <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
        <span style={{fontSize: '13px', color: 'var(--ink-2)'}}>Signed in as <strong style={{color: 'var(--ink)', fontWeight: 500}}>{roleName}</strong></span>
        <Button variant="quiet" onClick={logout}>Sign out</Button>
      </div>
    );
  }

  return (
    <div style={{position: 'relative'}}>
      <Button variant="secondary" onClick={() => setOpen(!open)}>Sign in</Button>
      {open && hostedAuth && <HostedSignIn adopt={adopt} onDone={() => setOpen(false)} />}
      {open && !hostedAuth && (
        <form className="login-popover panel" style={{position: 'absolute', right: 0, top: '48px', width: '300px', zIndex: 50, background: 'var(--surface)', padding: '24px', borderRadius: '8px', boxShadow: '0 12px 35px rgba(32,40,36,0.15)', border: '1px solid var(--line)'}} onSubmit={async e => {
          e.preventDefault(); setBusy(true); setError('');
          try { await login(user, otp); setOpen(false); }
          catch (err) { setError((err as Error).message); }
          finally { setBusy(false); }
        }}>
          <h3 style={{marginBottom: '16px'}}>Sign in to your workspace</h3>
          <label style={{display: 'block', marginBottom: '12px', fontSize: '12px', color: 'var(--ink-2)'}}>Demo account
            <select value={user} onChange={e => setUser(e.target.value)} style={{marginTop: '6px'}}>
              {['coordinator', 'manager', 'supervisor', 'requester', 'ravi', 'priya', 'storekeeper', 'auditor', 'admin'].map(u => <option key={u}>{u}</option>)}
            </select>
          </label>
          <label style={{display: 'block', marginBottom: '16px', fontSize: '12px', color: 'var(--ink-2)'}}>One-time code
            <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="Enter your OTP" inputMode="numeric" autoComplete="one-time-code" style={{marginTop: '6px'}}/>
          </label>
          <div style={{marginBottom: '16px'}}>
            <Button type="button" variant="quiet" disabled={busy} onClick={async () => {
              setBusy(true); setError('');
              try {
                const result = await api<any>('/auth/otp', { method: 'POST', body: JSON.stringify({ user_id: user }) });
                if (result.demo_otp || result.otp) { setOtp(result.demo_otp || result.otp); }
                else setError('Check your development inbox for the code.');
              } catch (err) { setError((err as Error).message); }
              finally { setBusy(false); }
            }}>Request code</Button>
          </div>
          {error && <div role="alert" style={{padding: '12px', background: 'var(--surface-sunken)', color: 'var(--critical)', borderRadius: '4px', marginBottom: '16px', fontSize: '13px'}}>{error}</div>}
          <Button variant="primary" type="submit" busy={busy} style={{width: '100%'}}>Continue →</Button>
        </form>
      )}
    </div>
  );
}
