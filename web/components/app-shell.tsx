'use client';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import { SessionBar } from '@/components/session-bar';
import { Navigation } from '@/components/navigation';
export function AppShell({children}:{children:React.ReactNode}) {
  const pathname=usePathname();
  if(pathname==='/')return <>{children}</>;
  return <div className="app-shell"><aside className="sidebar"><Link href="/" className="brand" aria-label="Rivet home"><div className="brand-badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 3h4v18h-4V3z"/><path d="M9.5 3h5c3.3 0 6 2.46 6 5.5s-2.7 5.5-6 5.5h-5V3zm4 3.2h-1v4.6h1c1.4 0 2.5-.9 2.5-2.3s-1.1-2.3-2.5-2.3z"/><path d="M12.5 13h3.8L20.5 21H16l-3.5-6.5V13z"/></svg></div><div className="brand-text"><span className="brand-title">RIVET</span><span className="brand-sub">BUILT FOR THE FIELD</span></div></Link><div className="nav-label">OPERATIONS / INDEX</div><Navigation/><div className="sidebar-bottom"><div className="rail-drawing" aria-hidden="true"><svg viewBox="0 0 180 110" fill="none"><path d="M15 85h150M30 85V25h120v60M45 25v14h90V25M65 39v25h50V39M56 70h68v15M90 8v17M48 15h84M12 95h156" stroke="currentColor"/><circle cx="151" cy="43" r="13" stroke="currentColor"/><path d="m151 43 6-6M151 56v29M79 49h22M90 42v14" stroke="currentColor"/></svg></div><span className="rail-caption">KEEP GOOD MACHINES RUNNING.</span><div className="rail-footer">INDUSTRIAL SERVICES <span>R / 01</span></div></div></aside><div className="workspace"><header className="topbar"><span className="breadcrumb">FIELD OPERATIONS <span>/</span> SERVICE NETWORK</span><SessionBar/></header><main>{children}</main></div></div>;
}

