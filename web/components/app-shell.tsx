'use client';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import { SessionBar } from '@/components/session-bar';
import { Navigation } from '@/components/navigation';
export function AppShell({children}:{children:React.ReactNode}) {
  const pathname=usePathname();
  if(pathname==='/')return <>{children}</>;
  return <div className="app-shell"><aside className="sidebar"><Link href="/" className="brand" aria-label="Rivet home"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M6 4h12c7 0 10 4 10 9 0 4-2 7-6 8l7 8h-9l-6-8h-1v8H6V4zm7 6v6h5c3 0 4-1 4-3s-1-3-4-3h-5z" fill="currentColor"/><circle cx="7" cy="30" r="1" fill="currentColor"/><path d="M11 30h18" stroke="currentColor"/></svg></span><span>ivet<small>BUILT FOR THE FIELD</small></span></Link><div className="nav-label">OPERATIONS / INDEX</div><Navigation/><div className="sidebar-bottom"><div className="rail-drawing" aria-hidden="true"><svg viewBox="0 0 180 110" fill="none"><path d="M15 85h150M30 85V25h120v60M45 25v14h90V25M65 39v25h50V39M56 70h68v15M90 8v17M48 15h84M12 95h156" stroke="currentColor"/><circle cx="151" cy="43" r="13" stroke="currentColor"/><path d="m151 43 6-6M151 56v29M79 49h22M90 42v14" stroke="currentColor"/></svg></div><span className="rail-caption">KEEP GOOD MACHINES RUNNING.</span><div className="rail-footer">INDUSTRIAL SERVICES <span>R / 01</span></div></div></aside><div className="workspace"><header className="topbar"><span className="breadcrumb">FIELD OPERATIONS <span>/</span> SERVICE NETWORK</span><SessionBar/></header><main>{children}</main></div></div>;
}

