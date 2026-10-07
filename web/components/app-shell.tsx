'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, X, Radio } from 'lucide-react';
import { SessionBar } from '@/components/session-bar';
import { Navigation } from '@/components/navigation';
import { Logo } from '@/components/logo';
import { DemoBanner, DemoPill } from '@/components/demo-notice';
import { useSummary } from '@/lib/use-summary';
import { useSession } from '@/lib/api';
import { canOpen, destinationsFor, homeFor, roleLabel } from '@/lib/roles';
import s from './shell.module.css';

/** Shown when a signed-in role opens a page that is not part of its workspace. The API refuses the data as well. */
function NoAccess({ role }: { role: string }) {
  const own = destinationsFor(role);
  return (
    <div className="panel" role="status" data-testid="no-access" style={{ maxWidth: 560 }}>
      <h2>This page is not part of the {roleLabel(role)} workspace</h2>
      <p className="muted" style={{ margin: '8px 0 16px' }}>
        You are signed in as {roleLabel(role)}, which works in: {own.map(d => d.label).join(', ') || 'no workspace pages'}.
        Sign in with a different role to see the rest.
      </p>
      <Link className="primary-button" href={homeFor(role)}>Go to {own[0]?.label ?? 'service records'}</Link>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { summary } = useSummary();
  const { session } = useSession();
  const blocked = !!session && !canOpen(session.role, pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  if (pathname === '/') {
    return (
      <div className="homepage-wrapper">
        <DemoBanner />
        {children}
      </div>
    );
  }
  
  const siteScope = summary?.sites?.map(s => s.name).join(', ') || 'All sites';

  return (
    <div className="app-shell">
      {/* Desktop Persistent Dark Sidebar */}
      <aside className="sidebar">
        <Link href="/" className={s.brandLink} aria-label="Rivet home">
          <Logo variant="dark" />
        </Link>
        <Navigation />
      </aside>

      {/* Mobile Slide-out Drawer */}
      {mobileMenuOpen && (
        <div className={s.mobileOverlay} onClick={() => setMobileMenuOpen(false)}>
          <aside className={s.mobileDrawer} onClick={e => e.stopPropagation()}>
            <div className={s.mobileDrawerHeader}>
              <Logo variant="dark" />
              <button className={s.closeButton} onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            <div onClick={() => setMobileMenuOpen(false)}>
              <Navigation />
            </div>
          </aside>
        </div>
      )}
      
      <div className="workspace-shell">
        <DemoBanner />
        <header className="topbar">
          <div className={s.topbarLeft}>
            <button
              className={s.menuButton}
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>
            <span className={s.sitesScope}>
              Active Site Scope: <strong>{siteScope}</strong>
            </span>
          </div>

          <div className={s.topbarRight}>
            <DemoPill />
            <div className={s.liveIndicator}>
              <span className={s.liveDot} />
              <span>LIVE TELEMETRY</span>
            </div>
            <SessionBar />
          </div>
        </header>

        <main className="workspace-main" id="main-content">
          {blocked && session ? <NoAccess role={session.role} /> : children}
        </main>
      </div>
    </div>
  );
}
