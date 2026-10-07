import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { SessionBar } from '@/components/session-bar';
import { Navigation } from '@/components/navigation';
export const metadata: Metadata = {title:'Rivet · Industrial service operations', description:'Coordinate commitments, recover disruptions and verify industrial service.'};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body><div className="app-shell"><aside className="sidebar"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M6 5h7v9h6V5h7v22h-7v-9h-6v9H6z" fill="currentColor"/><path d="M3 30h26" stroke="currentColor"/></svg></span><span>RIVET<small>BUILT FOR THE FIELD</small></span></Link><div className="nav-label">OPERATIONS / INDEX</div><Navigation/><div className="sidebar-bottom"><div className="rail-drawing" aria-hidden="true"><svg viewBox="0 0 180 110" fill="none"><path d="M15 85h150M30 85V25h120v60M45 25v14h90V25M65 39v25h50V39M56 70h68v15M90 8v17M48 15h84M12 95h156" stroke="currentColor"/><circle cx="151" cy="43" r="13" stroke="currentColor"/><path d="m151 43 6-6M151 56v29M79 49h22M90 42v14" stroke="currentColor"/></svg></div><span className="rail-caption">KEEP GOOD MACHINES RUNNING.</span><div className="rail-footer">INDUSTRIAL SERVICES <span>H / 01</span></div></div></aside><div className="workspace"><header className="topbar"><span className="breadcrumb">FIELD OPERATIONS <span>/</span> SERVICE NETWORK</span><SessionBar/></header><main>{children}</main></div></div></body></html>;
}
