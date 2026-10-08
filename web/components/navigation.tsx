'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ClipboardCheck, Fingerprint, ScanLine, BadgeCheck, UsersRound, Wrench, Boxes, Smartphone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSession } from '../lib/api';
import { destinationsFor } from '../lib/roles';
import s from './shell.module.css';

const icons: Record<string, LucideIcon> = {
  '/control': LayoutDashboard,
  '/portal': ClipboardCheck,
  '/passport': BadgeCheck,
  '/verify': Fingerprint,
  '/stores': Boxes,
  '/gate': ScanLine,
  '/tech': Wrench,
};

const adminOnly = [
  { href: '/team', label: 'Team access', Icon: UsersRound }
];

const fieldApp = { href: '/field-app', label: 'Get the Android app', Icon: Smartphone };

export function Navigation() {
  const pathname = usePathname();
  const { session } = useSession();
  const destinations = destinationsFor(session?.role).map(d => ({ ...d, Icon: icons[d.href] }));
  const fieldAppActive = pathname === fieldApp.href;
  const FieldAppIcon = fieldApp.Icon;
  
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

      <div className={s.navGroup}>
        <div className={s.navGroupTitle}>Field tools</div>
        <Link
          href={fieldApp.href}
          className={`${s.navLink} ${fieldAppActive ? s.navLinkActive : ''}`}
          aria-current={fieldAppActive ? 'page' : undefined}
        >
          <FieldAppIcon aria-hidden="true" size={18} strokeWidth={1.5} />
          <span>{fieldApp.label}</span>
        </Link>
      </div>

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
