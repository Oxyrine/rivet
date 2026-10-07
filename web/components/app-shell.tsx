'use client';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import { SessionBar } from '@/components/session-bar';
import { Navigation } from '@/components/navigation';
export function AppShell({children}:{children:React.ReactNode}) {
  const pathname=usePathname();
  if(pathname==='/')return <>{children}</>;
  return <div className="app-shell"><aside className="sidebar"><Link href="/" className="brand" aria-label="Rivet home"><div className="brand-badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M6 4h7c3.3 0 5.5 1.8 5.5 4.5 0 2.1-1.3 3.6-3.4 4.1l3.9 7.4h-3.8l-3.3-6.6H9.2V20H6V4zm3.2 2.7v4.6h3.6c1.5 0 2.5-.8 2.5-2.3 0-1.4-1-2.3-2.5-2.3H9.2z" fill="currentColor"/></svg></div><div className="brand-text"><span className="brand-title">RIVET</span><span className="brand-sub">BUILT FOR THE FIELD</span></div></Link><div className="nav-label">OPERATIONS / INDEX</div><Navigation/><div className="sidebar-bottom"><div className="rail-drawing" aria-hidden="true"><svg viewBox="0 0 180 110" fill="none"><path d="M15 85h150M30 85V25h120v60M45 25v14h90V25M65 39v25h50V39M56 70h68v15M90 8v17M48 15h84M12 95h156" stroke="currentColor"/><circle cx="151" cy="43" r="13" stroke="currentColor"/><path d="m151 43 6-6M151 56v29M79 49h22M90 42v14" stroke="currentColor"/></svg></div><span className="rail-caption">KEEP GOOD MACHINES RUNNING.</span><div className="rail-footer">INDUSTRIAL SERVICES <span>R / 01</span></div></div></aside><div className="workspace"><header className="topbar"><span className="breadcrumb">FIELD OPERATIONS <span>/</span> SERVICE NETWORK</span><SessionBar/></header><main>{children}</main></div></div>;
}

