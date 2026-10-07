'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ClipboardCheck, Fingerprint, ScanLine, BadgeCheck, UsersRound } from 'lucide-react';
import { useSession } from '../lib/api';
import s from './shell.module.css';

const destinations = [
  { href: '/control', label: 'Control room', Icon: LayoutDashboard },
  { href: '/portal', label: 'Customer approvals', Icon: ClipboardCheck },
  { href: '/passport', label: 'Machine passports', Icon: BadgeCheck },
  { href: '/verify', label: 'Service records', Icon: Fingerprint },
  { href: '/gate', label: 'Site arrival', Icon: ScanLine },
];

const adminOnly = [
  { href: '/team', label: 'Team access', Icon: UsersRound }
];

export function Navigation() {
  const pathname = usePathname();
  const { session } = useSession();
  
  return (
    <nav aria-label="Workspace" className={s.nav}>
      {destinations.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link 
            key={href} 
            href={href} 
            className={`${s.navLink} ${active ? s.navLinkActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={1.5} />
            <span>{label}</span>
          </Link>
        );
      })}

      {session?.role === 'admin' && (
        <div className={s.navGroup}>
          <div className={s.navGroupTitle}>Administration</div>
          {adminOnly.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link 
                key={href} 
                href={href} 
                className={`${s.navLink} ${active ? s.navLinkActive : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.5} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
