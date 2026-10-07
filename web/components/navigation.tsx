'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {LayoutDashboard, ClipboardCheck, Fingerprint, ScanLine, BadgeCheck} from 'lucide-react';
const destinations = [
  {href:'/control', label:'Control room', number:'01', Icon:LayoutDashboard},
  {href:'/portal', label:'Customer desk', number:'02', Icon:ClipboardCheck},
  {href:'/passport', label:'Machine passport', number:'03', Icon:BadgeCheck},
  {href:'/verify', label:'Service records', number:'04', Icon:Fingerprint},
  {href:'/gate', label:'Site arrival', number:'05', Icon:ScanLine},
];
export function Navigation(){
  const pathname=usePathname();
  return <nav aria-label="Workspace">{destinations.map(({href,label,number,Icon})=><Link key={href} href={href} title={label} aria-label={label} aria-current={pathname===href?'page':undefined}><Icon aria-hidden="true" size={17} strokeWidth={1.5}/><span>{label}</span><small aria-hidden="true">{number}</small></Link>)}</nav>;
}
