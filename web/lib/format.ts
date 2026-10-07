import { Site } from './use-summary';

export function humanState(state: string): string {
  if (state === 'pending_approval') return 'Awaiting approval';
  return state.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
}

export function humanFault(fault?: string): string {
  if (!fault) return 'Unknown fault';
  if (fault === 'hydraulic_leak') return 'Hydraulic leak';
  return fault.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
}

export function siteName(siteId: string, sites?: Site[]): string {
  if (!sites) return siteId.replace('site-', 'Site ').toUpperCase();
  const site = sites.find(s => s.id === siteId);
  return site ? site.name : siteId.replace('site-', 'Site ').toUpperCase();
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}, ${hh}:${mm} IST`;
}

export function relative(iso: string, nowIso?: string): string {
  const d = new Date(iso);
  const now = nowIso ? new Date(nowIso) : new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function money(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}
