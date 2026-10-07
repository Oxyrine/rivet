'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, X, Radio } from 'lucide-react';
import { SessionBar } from '@/components/session-bar';
import { Navigation } from '@/components/navigation';
import { Logo } from '@/components/logo';
import { useSummary } from '@/lib/use-summary';
import s from './shell.module.css';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { summary } = useSummary();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  if (pathname === '/') {
    return (
      <div className="homepage-wrapper">
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
            <div className={s.liveIndicator}>
              <span className={s.liveDot} />
              <span>LIVE TELEMETRY</span>
            </div>
            <SessionBar />
          </div>
        </header>

        <main className="workspace-main" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
