'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, ArrowRight, ArrowDown, Check, Search, LayoutDashboard, RefreshCw, ShieldCheck, Wrench, PackageCheck, Zap } from 'lucide-react';
import { SessionBar } from '@/components/session-bar';
import { Logo } from '@/components/logo';
import { api, useSession } from '@/lib/api';
import s from './landing.module.css';

type Job = {
  id: string;
  machine_id: string;
  site_id: string;
  state: string;
  priority: string;
  fault?: string;
  technician_id?: string;
};

const shortcuts = [
  { href: '/control', title: 'Control room', description: 'Real-time dispatch, risk signals, and disruption recovery' },
  { href: '/portal', title: 'Customer approvals', description: 'Review evidence, dispute items, and sign with PIN' },
  { href: '/passport', title: 'Machine passports', description: 'Full equipment history and verified audit trail' },
  { href: '/verify', title: 'Service records', description: 'Offline cryptographic verification and key pinning' },
  { href: '/gate', title: 'Site arrival', description: 'Ed25519 signed rotating arrival code' },
];

const stages = [
  {
    label: 'Plan the job',
    title: 'Know who’s going. Know what’s ready.',
    description: 'Match the service request to an eligible, qualified technician and lock down necessary spare parts before departure.',
    Icon: Wrench,
  },
  {
    label: 'Handle a change',
    title: 'See the impact before you change the plan.',
    description: 'Trace a technician dropout through downstream jobs, simulate candidate recovery plans, and execute zero-downtime reassignments.',
    Icon: RefreshCw,
  },
  {
    label: 'Close with evidence',
    title: 'Make every sign-off tamper-proof.',
    description: 'Reconcile issued parts with field logs, review photo proof, and capture cryptographic customer PIN acceptance into an immutable ledger.',
    Icon: ShieldCheck,
  },
];

import { getStatusConfig } from '@/lib/status';
import { humanFault, siteName } from '@/lib/format';
import { useSummary } from '@/lib/use-summary';
import { Button } from '@/components/ui/button';
import { StatusLabel } from '@/components/ui/status-label';
import { SectionHeader } from '@/components/ui/section-header';

function ServiceDesk() {
  const { session } = useSession();
  const { summary } = useSummary();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const refresh = useCallback(async () => {
    if (!session) {
      setJobs([]);
      setError('');
      return;
    }
    setLoading(true);
    try {
      const data = await api<Job[] | { items?: Job[]; jobs?: Job[] }>('/jobs');
      setJobs(Array.isArray(data) ? data : data.items || data.jobs || []);
      setError('');
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filtered = jobs.filter(j =>
    (priority === 'all' || j.priority === priority) &&
    [j.id, j.machine_id, j.site_id, j.technician_id || '', j.fault || ''].join(' ').toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <section id="service-desk" className={s.desk} aria-labelledby="desk-title">
      <SectionHeader
        title="Live Service Desk"
        description="Search active service requests, machine faults, and field technician assignments."
        actions={
          session && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {lastUpdated && (
                <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-2)' }}>
                  UPDATED {lastUpdated}
                </span>
              )}
              <Button variant="secondary" disabled={loading} onClick={refresh} title="Refresh jobs">
                <RefreshCw size={13} className={loading ? s.spin : ''} /> Refresh
              </Button>
            </div>
          )
        }
      />

      <div className={s.deskPanel}>
        <div className={s.deskToolbar}>
          <label className={s.search}>
            <Search size={16} />
            <input
              id="search-input"
              aria-label="Search service jobs"
              placeholder="Search machine (M-104), job (J-2231), site, or technician... (Press / to focus)"
              value={search}
              disabled={!session}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Clear search" className={s.clearSearch}>
                ×
              </button>
            )}
          </label>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <select
              aria-label="Filter jobs by priority"
              value={priority}
              onChange={e => setPriority(e.target.value)}
              disabled={!session}
              className={s.filterSelect}
            >
              <option value="all">All Priorities</option>
              <option value="P1">P1 · Urgent SLA</option>
              <option value="P2">P2 · Standard</option>
            </select>
          </div>
        </div>

        {!session ? (
          <div className={s.empty}>
            <div className={s.emptyIconWrap}>
              <LayoutDashboard size={28} strokeWidth={1.5} />
            </div>
            <h3>Sign in to view live service operations</h3>
            <p>Coordinators monitor active dispatches across all sites; customers track machines in their facility.</p>
            <Button variant="primary" onClick={() => window.dispatchEvent(new CustomEvent('rivet:open-signin'))}>
              Sign In to Workspace
            </Button>
          </div>
        ) : error ? (
          <div className={s.empty} role="alert">
            <h3>Unable to fetch operations</h3>
            <p>{error}</p>
            <Button variant="secondary" onClick={refresh}>
              Retry Connection
            </Button>
          </div>
        ) : loading && jobs.length === 0 ? (
          <div className={s.empty} role="status">
            <RefreshCw size={24} className={s.spin} />
            <p style={{ marginTop: '12px' }}>Connecting to dispatch telemetry...</p>
          </div>
        ) : !filtered.length ? (
          <div className={s.empty}>
            <Search size={24} />
            <h3>{jobs.length ? `No service jobs match '${search}'.` : 'No active service jobs.'}</h3>
            {jobs.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setPriority('all');
                }}
              >
                Reset Search Filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className={s.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Equipment / Job</th>
                    <th>Site Location</th>
                    <th>Assigned Technician</th>
                    <th>Operational Status</th>
                    <th>Priority</th>
                    <th><span className={s.srOnly}>Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 8).map(job => {
                    const status = getStatusConfig(job.state);
                    return (
                      <tr key={job.id}>
                        <td>
                          <strong>{job.machine_id}</strong>
                          <div className={s.subRow}>
                            <span className="mono">{job.id}</span>
                            <span className={s.faultDot}>·</span>
                            <span>{humanFault(job.fault)}</span>
                          </div>
                        </td>
                        <td>{siteName(job.site_id, summary?.sites)}</td>
                        <td>
                          {job.technician_id ? (
                            <span className={s.techBadge}>
                              <span className={s.avatarTiny}>{job.technician_id[0].toUpperCase()}</span>
                              <span className={s.name}>{job.technician_id}</span>
                            </span>
                          ) : (
                            <span className={s.unassigned}>Unassigned</span>
                          )}
                        </td>
                        <td>
                          <StatusLabel tone={status.tone}>{status.label}</StatusLabel>
                        </td>
                        <td>
                          <span className={job.priority === 'P1' ? s.urgentBadge : s.standardBadge}>
                            {job.priority === 'P1' ? 'P1 · URGENT' : 'P2 · STANDARD'}
                          </span>
                        </td>
                        <td>
                          <Link href={`/control?job=${encodeURIComponent(job.id)}`} passHref>
                            <Button variant="secondary" className={s.openButton}>
                              Inspect <ArrowUpRight size={13} />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={s.deskFooter}>
              <span>
                Showing {Math.min(filtered.length, 8)} of {filtered.length} active jobs
                {filtered.length !== jobs.length && (
                  <button
                    onClick={() => {
                      setSearch('');
                      setPriority('all');
                    }}
                    className={s.inlineLink}
                  >
                    (Clear filters)
                  </button>
                )}
              </span>
              <Link href="/control" passHref>
                <Button variant="quiet" className={s.footerCta}>
                  Open Full Control Room Board →
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function WorkflowPreview({ step }: { step: number }) {
  return (
    <div className={s.previewCard} key={step}>
      <div className={s.previewTop}>
        <div className={s.previewMachine}>
          <span className={s.liveDot} />
          <span>M-104 / 400-TON HYDRAULIC PRESS</span>
        </div>
        <span className={s.previewBadge}>STAGE 0{step + 1} OF 03</span>
      </div>

      <div className={s.previewBody}>
        {step === 0 ? (
          <>
            <div className={s.previewItem}>
              <div className={s.previewAvatar}>R</div>
              <div>
                <b>Ravi Shankar</b>
                <p>Lead Hydraulics Technician · 12 min ETA</p>
              </div>
              <span className={s.matchBadge}>98% Match</span>
            </div>
            <div className={s.checkRow}>
              <PackageCheck size={16} className={s.goodIcon} />
              <span>HS-40 High-Pressure Seal Kit</span>
              <b>Reserved (Bay 4)</b>
            </div>
            <div className={s.checkRow}>
              <Wrench size={16} className={s.goodIcon} />
              <span>Torque Calibrator + Sensor Kit</span>
              <b>Allocated</b>
            </div>
          </>
        ) : step === 1 ? (
          <>
            <div className={s.alertItem}>
              <span className={s.alertDot} />
              <div>
                <b>Technician Unavailable</b>
                <p>Ravi reported shift dropout · 3 downstream jobs impacted</p>
              </div>
            </div>
            <div className={s.previewItem}>
              <div className={s.previewAvatar}>P</div>
              <div>
                <b>Priya Nair</b>
                <p>Qualified Alternative · 0 SLA Misses Projected</p>
              </div>
              <span className={s.recoveryBadge}>Optimal Plan</span>
            </div>
            <div className={s.checkRow}>
              <Zap size={16} className={s.accentIcon} />
              <span>Dynamic Rerouting</span>
              <b>Auto-Simulated (4 combinations)</b>
            </div>
          </>
        ) : (
          <>
            <div className={s.previewItem}>
              <ShieldCheck size={28} className={s.shieldIcon} />
              <div>
                <b>Cryptographic Sign-off Ready</b>
                <p>All materials and telemetry verified</p>
              </div>
            </div>
            <div className={s.checkRow}>
              <Check size={16} className={s.goodIcon} />
              <span>Material consumption reconciled against storekeeper issuance</span>
            </div>
            <div className={s.checkRow}>
              <Check size={16} className={s.goodIcon} />
              <span>Field service inspection photos cryptographically hashed</span>
            </div>
            <div className={s.checkRow}>
              <Check size={16} className={s.goodIcon} />
              <span>Supervisor PIN validation anchored to customer-held audit trail</span>
            </div>
          </>
        )}
      </div>

      <div className={s.previewFoot}>
        <span className="mono">VERIFIED AUDITABLE WORKFLOW</span>
        <b>{stages[step].label}</b>
      </div>
    </div>
  );
}

export default function Landing() {
  const [stage, setStage] = useState(0);
  const StageIcon = stages[stage].Icon;

  return (
    <div className={s.landing}>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>

      {/* Top Navigation */}
      <header className={s.nav}>
        <Link href="/" aria-label="Rivet home" className={s.logoLink}>
          <Logo variant="light" />
        </Link>
        <nav aria-label="Main navigation" className={s.navLinks}>
          <a href="#service-desk">Service Desk</a>
          <a href="#how-it-works">How It Works</a>
          <Link href="/control">Control Room</Link>
          <Link href="/passport">Machine Passports</Link>
          <Link href="/verify">Records Verification</Link>
        </nav>
        <div className={s.navActions}>
          <SessionBar />
          <Link href="/control" passHref>
            <Button variant="primary" className={s.navWorkspaceButton}>
              Open Workspace <ArrowUpRight size={14} />
            </Button>
          </Link>
        </div>
      </header>

      <main id="main">
        {/* Approved Industrial Hero Section */}
        <section className={s.hero}>
          <div className={s.heroImage} aria-hidden="true" />
          <div className={s.heroOverlay} aria-hidden="true" />
          
          <div className={s.heroContent}>
            <div className={s.heroEyebrow}>
              <span className={s.heroPulse} />
              <span>BUILT FOR INDUSTRIAL EQUIPMENT TEAMS</span>
            </div>
            <h1>
              Good machines.<br />
              <em>Keep them running.</em>
            </h1>
            <p>
              Get the right people and parts to the job. Handle the disruptions. Keep a tamper-proof cryptographic record of every repair.
            </p>
            <div className={s.heroActions}>
              <Link href="/control" passHref>
                <Button variant="primary" className={s.orangeButton}>
                  Go to the control room <ArrowUpRight size={17} />
                </Button>
              </Link>
              <a href="#service-desk" className={s.heroSecondaryLink}>
                Find a service job <ArrowDown size={15} />
              </a>
            </div>
          </div>

          <div className={s.heroFoot}>
            <div>
              <span className="mono">NETWORK STATUS</span>
              <strong>04 ACTIVE SITES · 12 QUALIFIED TECHNICIANS</strong>
            </div>
            <div className={s.heroFootRight}>
              <span className="mono">AUDIT TRAIL</span>
              <strong>100% CRYPTOGRAPHICALLY VERIFIED</strong>
            </div>
          </div>
        </section>

        <div className={s.content}>
          <ServiceDesk />

          {/* Interactive Workflow Section */}
          <section id="how-it-works" className={s.workflow}>
            <SectionHeader
              title="How Rivet coordinates a service job"
              description="End-to-end industrial service workflow — from dispatch reservation to cryptographic customer sign-off."
            />
            <div className={s.workflowGrid}>
              <div className={s.workflowText}>
                <div className={s.tabs} role="tablist" aria-label="Service workflow stages">
                  {stages.map((item, i) => (
                    <button
                      key={item.label}
                      id={`stage-tab-${i}`}
                      role="tab"
                      aria-selected={stage === i}
                      aria-controls="workflow-panel"
                      tabIndex={stage === i ? 0 : -1}
                      onClick={() => setStage(i)}
                      className={stage === i ? s.activeTab : s.tab}
                    >
                      <span className="mono">0{i + 1}</span> {item.label}
                    </button>
                  ))}
                </div>
                <div id="workflow-panel" role="tabpanel" aria-labelledby={`stage-tab-${stage}`} tabIndex={0} className={s.tabPanel}>
                  <div className={s.stageHeader}>
                    <div className={s.stageIconWrap}>
                      <StageIcon size={22} />
                    </div>
                    <h3>{stages[stage].title}</h3>
                  </div>
                  <p>{stages[stage].description}</p>
                </div>
              </div>
              <WorkflowPreview step={stage} />
            </div>
          </section>

          {/* Workspace Shortcuts Section */}
          <section className={s.shortcutsSection} aria-label="Workspace shortcuts">
            <SectionHeader
              title="Operational Workspaces"
              description="Dedicated interfaces for dispatchers, technicians, supervisors, and customer auditors."
            />
            <div className={s.shortcuts}>
              {shortcuts.map(({ href, title, description }) => (
                <Link key={href} href={href} className={s.shortcutCard}>
                  <div className={s.shortcutHeader}>
                    <h2>{title}</h2>
                    <ArrowRight size={15} className={s.shortcutArrow} />
                  </div>
                  <p>{description}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Industrial Footer */}
      <footer className={s.footer}>
        <div className={s.footerTop}>
          <Link href="/" aria-label="Rivet home">
            <Logo variant="light" />
          </Link>
          <div className={s.footerLinks}>
            <Link href="/control">Control Room</Link>
            <Link href="/portal">Customer Portal</Link>
            <Link href="/passport">Machine Passports</Link>
            <Link href="/verify">Service Verification</Link>
            <Link href="/gate">Site Arrival</Link>
          </div>
        </div>
        <div className={s.footerBottom}>
          <span>Rivet Industrial Service Operations Platform</span>
          <small>Precision equipment telemetry & tamper-proof custody records</small>
        </div>
      </footer>
    </div>
  );
}
