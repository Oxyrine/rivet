import { NextRequest, NextResponse } from 'next/server';
import { demoEngine } from '@/lib/demo-engine';

export const dynamic = 'force-dynamic';

async function tryProxy(request: NextRequest, path: string): Promise<Response | null> {
  const apiUrl = process.env.API_URL;
  // If API_URL points to localhost in a production environment, don't attempt to proxy as it will fail
  if (!apiUrl || (process.env.NODE_ENV === 'production' && (apiUrl.includes('127.0.0.1') || apiUrl.includes('localhost')))) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const headers = new Headers(request.headers);
    headers.delete('host');

    const body = ['GET', 'HEAD'].includes(request.method.toUpperCase()) ? undefined : await request.text();

    const targetUrl = `${apiUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}${request.nextUrl.search}`;
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeout);
    if (response.ok || response.status === 401 || response.status === 403 || response.status === 422) {
      const respData = await response.text();
      return new Response(respData, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/json',
        },
      });
    }
    return null;
  } catch {
    return null;
  }
}

async function handle(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');
  const method = request.method.toUpperCase();

  // 1. Check if remote proxy is reachable
  const proxied = await tryProxy(request, path);
  if (proxied) return proxied;

  // 2. Local high-fidelity Demo Engine fallback
  let body: any = {};
  if (!['GET', 'HEAD'].includes(method)) {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  // --- Auth & Session Endpoints ---
  if (path === 'auth/demo-entry') {
    if (method === 'GET') {
      return NextResponse.json({
        enabled: true,
        roles: [
          { user_id: 'coordinator' },
          { user_id: 'manager' },
          { user_id: 'supervisor' },
          { user_id: 'requester' },
          { user_id: 'ravi' },
          { user_id: 'priya' },
          { user_id: 'storekeeper' },
          { user_id: 'auditor' },
          { user_id: 'admin' },
        ],
      });
    }
    const token = demoEngine.generateJwt(body.user_id || 'coordinator');
    return NextResponse.json({ access_token: token, token_type: 'bearer' });
  }

  if (path === 'auth/token') {
    const userId = body.user_id || 'coordinator';
    const token = demoEngine.generateJwt(userId);
    const role = demoEngine.technicians[userId] ? 'technician' : userId;
    return NextResponse.json({
      access_token: token,
      token_type: 'bearer',
      principal: {
        user_id: userId,
        role: role,
        sites: ['site-a', 'site-b', 'site-c'],
        device_id: `device-${userId}`,
      },
    });
  }

  if (path === 'auth/otp') {
    return NextResponse.json({ sent: true, demo_otp: '246810' });
  }

  if (path === 'auth/me') {
    const authHeader = request.headers.get('authorization') || '';
    let userId = 'coordinator';
    let role = 'coordinator';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const payload = JSON.parse(Buffer.from(authHeader.replace('Bearer ', '').split('.')[1], 'base64url').toString());
        if (payload.sub) userId = payload.sub;
        if (payload.role) role = payload.role;
      } catch {}
    }
    return NextResponse.json({
      user_id: userId,
      role: role,
      sites: ['site-a', 'site-b', 'site-c'],
      device_id: `device-${userId}`,
    });
  }

  // --- Dashboard Summary ---
  if (path === 'dashboard/summary') {
    return NextResponse.json(demoEngine.getSummary());
  }

  // --- Jobs Endpoints ---
  if (path === 'jobs') {
    return NextResponse.json(demoEngine.getJobs());
  }

  if (path.startsWith('jobs/')) {
    const segments = path.split('/');
    const jobId = segments[1];
    const sub = segments[2];

    if (sub === 'assign' && method === 'POST') {
      const job = demoEngine.assignJob(jobId, body.technician_id || null);
      return NextResponse.json(job);
    }

    if (sub === 'reconciliation' && method === 'GET') {
      return NextResponse.json({
        job_id: jobId,
        status: 'reconciled',
        variance_paise: 0,
        parts: [],
      });
    }

    if (!sub && method === 'GET') {
      const job = demoEngine.getJob(jobId);
      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      return NextResponse.json(job);
    }
  }

  // --- Service Requests Endpoints ---
  if (path === 'requests') {
    if (method === 'POST') {
      try {
        const res = demoEngine.createRequest(body);
        return NextResponse.json(res);
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    }
  }

  if (path.startsWith('requests/')) {
    const segments = path.split('/');
    const reqId = segments[1];
    const sub = segments[2];

    if (sub === 'approve' && method === 'POST') {
      const res = demoEngine.approveRequest(reqId);
      return NextResponse.json(res);
    }

    if (!sub && method === 'GET') {
      const req = demoEngine.requests[reqId] || Object.values(demoEngine.requests).find(r => r.job_id === reqId);
      if (req) return NextResponse.json(req);
      return NextResponse.json({ id: reqId, state: 'approved' });
    }
  }

  // --- Exceptions, Risk & Recovery Endpoints ---
  if (path === 'exceptions/risk') {
    return NextResponse.json(demoEngine.getRisk());
  }

  if (path.startsWith('exceptions/plans/')) {
    const segments = path.split('/');
    const target = segments[2];
    const sub = segments[3];

    if (sub === 'approve' && method === 'POST') {
      return NextResponse.json(demoEngine.approvePlan(target));
    }

    if (!sub && method === 'GET') {
      return NextResponse.json(demoEngine.getRecovery(target));
    }
  }

  if (path.startsWith('exceptions/dropout/') || path.startsWith('technicians/') && path.endsWith('/dropout')) {
    const techId = path.split('/')[2];
    return NextResponse.json(demoEngine.reportDropout(techId));
  }

  if (path.startsWith('plans/') && path.endsWith('/approve')) {
    const planId = path.split('/')[1];
    return NextResponse.json(demoEngine.approvePlan(planId));
  }

  // --- Adapters Endpoints ---
  if (path === 'adapters') {
    return NextResponse.json(demoEngine.adapters);
  }

  if (path === 'adapters/billing/enable') {
    demoEngine.adapters.billing.enabled = true;
    return NextResponse.json({ enabled: true });
  }

  // --- Admin & Passport ---
  if (path === 'admin/users') {
    return NextResponse.json([
      { user_id: 'coordinator', role: 'coordinator', sites: ['site-a', 'site-b', 'site-c'], linked: true },
      { user_id: 'manager', role: 'manager', sites: ['site-a', 'site-b', 'site-c'], linked: true },
      { user_id: 'supervisor', role: 'supervisor', sites: ['site-a', 'site-b'], linked: true },
      { user_id: 'requester', role: 'requester', sites: ['site-a'], linked: true },
      { user_id: 'ravi', role: 'technician', sites: ['site-a', 'site-b', 'site-c'], technician_id: 'ravi', linked: true },
      { user_id: 'priya', role: 'technician', sites: ['site-a', 'site-b', 'site-c'], technician_id: 'priya', linked: true },
      { user_id: 'storekeeper', role: 'storekeeper', sites: ['site-b'], linked: true },
      { user_id: 'auditor', role: 'auditor', sites: ['site-a', 'site-b', 'site-c'], linked: true },
      { user_id: 'admin', role: 'admin', sites: ['site-a', 'site-b', 'site-c'], linked: true },
    ]);
  }

  if (path === 'admin/clock') {
    return NextResponse.json({ now: new Date().toISOString() });
  }

  if (path.startsWith('machines/') && path.endsWith('/passport')) {
    const machineId = path.split('/')[1];
    const machine = demoEngine.machines[machineId] || { id: machineId, name: 'Equipment' };
    return NextResponse.json({
      machine_id: machineId,
      name: machine.name,
      site_id: machine.site_id || 'site-a',
      serial_number: `SN-${machineId}-2026-X`,
      contract_tier: machine.contract_id || 'P1',
      total_operations: 18,
      verified_events: 42,
      last_service: new Date(Date.now() - 86400000 * 5).toISOString(),
      health_index: 98.4,
    });
  }

  if (path === '.well-known/rivet-keys.json') {
    return NextResponse.json({
      keys: [
        {
          kid: 'k-demo-01',
          kty: 'OKP',
          crv: 'Ed25519',
          x: '74YByMEJ6h_S4AzD4PBGn3PCcMAbidAAG06m7E59ASs',
        },
      ],
    });
  }

  return NextResponse.json({ message: 'OK', path });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
