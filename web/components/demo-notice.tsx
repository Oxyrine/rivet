'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { hostedAuth } from '@/lib/supabase';
import s from './demo-notice.module.css';

export const DEMO_TEXT = 'Demo only. This site is a demonstration with sample data. Anyone with the link can enter as these roles, and the data can be reset at any time. Do not enter real or confidential information.';

/** True when this site is a demo: a local build, or a hosted server whose operator turned demo entry on. */
export function useDemoMode() {
  const [on, setOn] = useState(!hostedAuth);
  useEffect(() => {
    if (!hostedAuth) return;
    let live = true;
    api<{ enabled: boolean }>('/auth/demo-entry').then(r => { if (live) setOn(!!r.enabled); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return on;
}

/** The warning shown where people sign in. */
export function DemoNotice() {
  return (
    <div role="note" data-testid="demo-notice" className={s.notice}>
      <b>Demo only</b>
      <span>{DEMO_TEXT.replace('Demo only. ', '')}</span>
    </div>
  );
}

/** A strip across the top of every page while the site is a demo. */
export function DemoBanner() {
  if (!useDemoMode()) return null;
  return <div role="note" data-testid="demo-banner" className={s.banner}><b>DEMO</b> Sample data for demonstration purposes only. Not for real operations or real information.</div>;
}

/** A small badge that stays visible in the sticky top bar. */
export function DemoPill() {
  if (!useDemoMode()) return null;
  return <span className={s.pill} title={DEMO_TEXT}>DEMO ONLY</span>;
}
