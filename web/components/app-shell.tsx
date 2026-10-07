'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { SessionBar } from '@/components/session-bar';
import { Navigation } from '@/components/navigation';
import { Logo } from '@/components/logo';
import { useSummary } from '@/lib/use-summary';
import s from './shell.module.css';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { summary } = useSummary();
  
  if (pathname === '/') return <>{children}</>;
  
  const siteScope = summary?.sites?.map(s => s.name).join(', ') || 'All sites';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className={s.brandLink} aria-label="Rivet home">
          <Logo variant="dark" />
        </Link>
        <Navigation />
      </aside>
      
      <div className="workspace">
        <header className="topbar">
          <div className={s.topbarLeft}>
            <button className={s.menuButton} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <span className={s.sitesScope}>
              Sites: {siteScope}
            </span>
          </div>
          <SessionBar />
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

