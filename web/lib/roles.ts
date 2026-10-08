/** Which workspace each role gets. The API still enforces every rule; this only decides what the screens offer. */
export type Destination = { href: string; label: string };

export const DESTINATIONS: Record<string, Destination> = {
  control: { href: '/control', label: 'Control room' },
  portal: { href: '/portal', label: 'Customer approvals' },
  passport: { href: '/passport', label: 'Machine passports' },
  verify: { href: '/verify', label: 'Service records' },
  stores: { href: '/stores', label: 'Stores' },
  gate: { href: '/gate', label: 'Site arrival' },
  tech: { href: '/tech', label: 'Field app' },
  team: { href: '/team', label: 'Team access' },
};

/** Pages in sidebar order. The first is where the role lands after signing in. */
export const ACCESS: Record<string, string[]> = {
  admin: ['control', 'portal', 'passport', 'verify', 'stores', 'gate', 'tech'],
  coordinator: ['control', 'stores', 'passport', 'verify'],
  manager: ['control', 'stores', 'passport', 'verify'],
  auditor: ['control', 'passport', 'verify'],
  supervisor: ['portal', 'passport', 'verify', 'gate'],
  requester: ['portal', 'passport', 'verify'],
  storekeeper: ['stores', 'verify'],
  technician: ['tech'],
};

/** Administration pages, listed apart from the workspace. */
export const ADMIN_ONLY = ['team'];

/** Roles that may change things in the control room. The auditor reads everything and changes nothing. */
export const DISPATCHERS = ['admin', 'coordinator', 'manager'];

/** Pages anyone may open, signed in or not: the customer-held record verifier. */
const PUBLIC = ['/verify', '/field-app'];

export function destinationsFor(role?: string): Destination[] {
  if (!role) return [DESTINATIONS.verify];
  return (ACCESS[role] ?? []).map(key => DESTINATIONS[key]);
}

const within = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Pages that belong to this role's own workspace (the sidebar, plus Team access for an admin). */
export function ownsPage(role: string | undefined, pathname: string): boolean {
  if (!role) return false;
  const pages = [...(ACCESS[role] ?? []).map(key => DESTINATIONS[key].href), ...(role === 'admin' ? ADMIN_ONLY.map(key => DESTINATIONS[key].href) : [])];
  return pages.some(href => within(pathname, href));
}

/** Whether a signed-in role may view this page at all: its own pages, the public verifier, and pages outside the workspace. */
export function canOpen(role: string | undefined, pathname: string): boolean {
  if (PUBLIC.some(p => within(pathname, p))) return true;
  if (!role) return true; // signed out: each page asks the person to sign in
  if (!Object.values(DESTINATIONS).some(d => within(pathname, d.href))) return true; // home, 404
  return ownsPage(role, pathname);
}

export function homeFor(role?: string): string {
  return destinationsFor(role)[0]?.href ?? '/verify';
}

export const roleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);
