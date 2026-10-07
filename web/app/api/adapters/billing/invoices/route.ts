import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';

// Local demo only: reads and refreshes the standalone billing adapter's SQLite file
// by running the Python adapter on this machine. A deployed build has no adapter and
// no Python, so the route is closed unless this is a dev server or LOCAL_BILLING_ADAPTER=1
// (the e2e run sets it); a Vercel build sets neither.
export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL || 'http://127.0.0.1:8000';
const ALLOWED_ROLES = ['coordinator', 'manager', 'admin'];
const READ_INVOICES = 'from adapters.billing.db import get_invoices; import json; print(json.dumps(get_invoices()))';

function run(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('python', args, { cwd, timeout: 20000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

async function authorised(request: NextRequest): Promise<boolean> {
  const authorization = request.headers.get('authorization');
  if (!authorization) return false;
  try {
    const response = await fetch(`${API_URL}/auth/me`, { headers: { authorization }, cache: 'no-store' });
    if (!response.ok) return false;
    const principal = await response.json();
    return ALLOWED_ROLES.includes(principal.role);
  } catch {
    return false;
  }
}

async function guard(request: NextRequest): Promise<NextResponse | null> {
  if (process.env.NODE_ENV === 'production' && process.env.LOCAL_BILLING_ADAPTER !== '1') {
    return NextResponse.json({ invoices: [], error: 'Billing adapter runs locally only' }, { status: 404 });
  }
  if (!(await authorised(request))) {
    return NextResponse.json({ invoices: [], error: 'Sign in as a coordinator or manager' }, { status: 401 });
  }
  return null;
}

async function invoices(cwd: string) {
  try {
    return JSON.parse((await run(['-c', READ_INVOICES], cwd)).trim());
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  return NextResponse.json({ invoices: await invoices(path.resolve(process.cwd(), '..')) });
}

export async function POST(request: NextRequest): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const root = path.resolve(process.cwd(), '..');
  await run(['-m', 'adapters.billing.main', '--once'], root).catch(() => undefined);
  return NextResponse.json({ invoices: await invoices(root) });
}
