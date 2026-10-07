'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, ArrowRight, Check, Search, LayoutDashboard, ClipboardCheck, Fingerprint, ScanLine, PackageCheck, Wrench, RefreshCw, ShieldCheck } from 'lucide-react';
import { SessionBar } from '@/components/session-bar';
import { Logo } from '@/components/logo';
import { api, useSession } from '@/lib/api';
import s from './landing.module.css';

type Job={id:string;machine_id:string;site_id:string;state:string;priority:string;fault?:string;technician_id?:string};
const shortcuts = [
  { href: '/control', title: 'Control room', description: 'Dispatch, risk, recovery' },
  { href: '/portal', title: 'Customer approvals', description: 'Review evidence' },
  { href: '/passport', title: 'Machine passports', description: 'Service history' },
  { href: '/verify', title: 'Service records', description: 'Verify a signed record' },
  { href: '/gate', title: 'Site arrival', description: 'Show the gate code' },
];
const stages=[
 {label:'Plan the job',title:'Know who’s going. Know what’s ready.',description:'Match the request to a qualified technician and reserve the parts they need before work begins.',Icon:Wrench},
 {label:'Handle a change',title:'See the impact before you change the plan.',description:'Trace a dropout through connected jobs, compare recovery options and approve the right reassignment.',Icon:RefreshCw},
 {label:'Close with evidence',title:'Make every sign-off easy to check.',description:'Reconcile the materials and service evidence, then let the customer accept the exact report.',Icon:ShieldCheck},
];

import { getStatusConfig } from '@/lib/status';
import { humanFault, siteName, dateTime } from '@/lib/format';
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

  const refresh = useCallback(async () => {
    if (!session) { setJobs([]); setError(''); return; }
    setLoading(true);
    try {
      const data = await api<Job[] | { items?: Job[]; jobs?: Job[] }>('/jobs');
      setJobs(Array.isArray(data) ? data : data.items || data.jobs || []);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

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
        title="Service desk" 
        description="Find a job and open it."
        actions={
          session && (
            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
              <span style={{fontSize: '12px', color: 'var(--ink-2)'}}>
                Updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
              </span>
              <Button variant="secondary" disabled={loading} onClick={refresh} title="Refresh jobs">
                <RefreshCw size={14} /> Refresh
              </Button>
            </div>
          )
        }
      />
      
      <div className={s.deskPanel}>
        <div className={s.deskToolbar}>
          <label className={s.search}>
            <Search size={17} />
            <input 
              id="search-input"
              aria-label="Search service jobs" 
              placeholder="Search machine, job, site or technician... (Press /)" 
              value={search} 
              disabled={!session} 
              onChange={e => setSearch(e.target.value)} 
            />
            {search && <button onClick={() => setSearch('')} aria-label="Clear search" className={s.clearSearch}>×</button>}
          </label>
          <div style={{display: 'flex', gap: '8px', flexShrink: 0}}>
            <select aria-label="Filter jobs by priority" value={priority} onChange={e => setPriority(e.target.value)} disabled={!session} className={s.filterSelect}>
              <option value="all">All priorities</option>
              <option value="P1">P1 · Urgent</option>
              <option value="P2">P2 · Standard</option>
            </select>
            <select aria-label="Filter jobs by status" disabled={!session} className={s.filterSelect}>
              <option value="all">All statuses</option>
            </select>
          </div>
        </div>

        {!session ? (
          <div className={s.empty}>
            <LayoutDashboard size={28} strokeWidth={1.3} />
            <h3>Your service jobs appear here after you sign in.</h3>
            <p>Coordinators see every site they manage; customers see their own machines.</p>
            <Button variant="primary" onClick={() => window.dispatchEvent(new CustomEvent('rivet:open-signin'))}>
              Sign in
            </Button>
          </div>
        ) : error ? (
          <div className={s.empty} role="alert">
            <h3>We couldn't load your jobs.</h3>
            <p>{error}</p>
            <Button variant="secondary" onClick={refresh}>Try again</Button>
          </div>
        ) : loading && jobs.length === 0 ? (
          <div className={s.empty} role="status">
            <p>Loading service jobs...</p>
          </div>
        ) : !filtered.length ? (
          <div className={s.empty}>
            <Search size={25} />
            <h3>{jobs.length ? `No jobs match '${search}'.` : 'No service jobs yet.'}</h3>
            {jobs.length > 0 && <Button variant="secondary" onClick={() => { setSearch(''); setPriority('all'); }}>Clear search and filters</Button>}
          </div>
        ) : (
          <>
            <div className={s.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Equipment / job</th>
                    <th>Site</th>
                    <th>Technician</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th><span className={s.srOnly}>Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 6).map(job => {
                    const status = getStatusConfig(job.state);
                    return (
                      <tr key={job.id}>
                        <td>
                          <strong>{job.machine_id}</strong>
                          <br />
                          <small className="mono">
                            {job.id} · <span className={job.priority === 'P1' ? s.urgent : ''}>{job.priority}</span>
                          </small>
                          <br />
                          <span style={{fontSize: '12px', color: 'var(--ink-2)'}}>{humanFault(job.fault)}</span>
                        </td>
                        <td>{siteName(job.site_id, summary?.sites)}</td>
                        <td className={s.name}>{job.technician_id || '—'}</td>
                        <td>
                          <StatusLabel tone={status.tone}>{status.label}</StatusLabel>
                        </td>
                        <td className="tabular-nums" style={{color: 'var(--ink-2)'}}>—</td>
                        <td>
                          <Link href={`/control?job=${encodeURIComponent(job.id)}`} passHref>
                            <Button variant="secondary">Open</Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={s.deskFooter}>
              <span>Showing {Math.min(filtered.length, 6)} of {filtered.length} jobs · {filtered.length !== jobs.length && <button onClick={() => {setSearch(''); setPriority('all')}} style={{background:'none',border:'none',color:'var(--ink)',textDecoration:'underline',cursor:'pointer',padding:0}}>Clear filters</button>}</span>
              <Link href="/control" passHref>
                <Button variant="quiet">Open the control room →</Button>
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
    <div className={s.preview} key={step}>
      <div className={s.previewTop}>
        <span>M-104 / HYDRAULIC PRESS</span>
        <small>EXAMPLE WORKFLOW</small>
      </div>
      {step === 0 ? (
        <>
          <div className={s.assignment}>
            <span className={s.avatar}>R</span>
            <div><b>Ravi</b><p>Qualified · hydraulics</p></div>
            <Check size={18} />
          </div>
          <div className={s.checkRow}><PackageCheck size={17} /><span>HS-40 seal kit</span><b>Reserved</b></div>
          <div className={s.checkRow}><Wrench size={17} /><span>Technician time</span><b>Allocated</b></div>
        </>
      ) : step === 1 ? (
        <>
          <div className={s.issue}><span></span> Ravi is unavailable</div>
          <div className={s.assignment}>
            <span className={s.avatar}>P</span>
            <div><b>Priya</b><p>Qualified replacement</p></div>
            <Check size={18} />
          </div>
          <div className={s.checkRow}><span>3 connected jobs</span><b>Recovery planned</b></div>
          <div className={s.checkRow}><span>Projected SLA misses</span><b>0</b></div>
        </>
      ) : (
        <>
          <div className={s.assignment}>
            <ShieldCheck size={31} strokeWidth={1.4} />
            <div><b>Ready for sign-off</b><p>Evidence reconciled</p></div>
          </div>
          {['Parts issuance checked', 'Service photos attached', 'Customer acceptance recorded'].map(label => (
            <div className={s.checkRow} key={label}><Check size={16} /><span>{label}</span></div>
          ))}
        </>
      )}
      <div className={s.previewFoot}>
        0{step + 1} / 03 <span>{stages[step].label}</span>
      </div>
    </div>
  );
}

export default function Landing() {
  const [stage, setStage] = useState(0);
  const StageIcon = stages[stage].Icon;

  useEffect(() => {
    const handleOpenSignin = () => {
      // Simulate click on sign in if necessary, handled by SessionBar state ideally
      // But we can just use the global event if SessionBar listens to it
    };
    window.addEventListener('rivet:open-signin', handleOpenSignin);
    return () => window.removeEventListener('rivet:open-signin', handleOpenSignin);
  }, []);

  return (
    <div className={s.landing}>
      <a href="#main" className={s.skip}>Skip to content</a>
      <header className={s.nav}>
        <Link href="/" aria-label="Rivet home"><Logo variant="light" /></Link>
        <nav aria-label="Main navigation">
          <a href="#service-desk">Service desk</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <div className={s.navActions}>
          <SessionBar />
          <Link href="/control" passHref>
            <Button variant="primary" style={{background: 'var(--surface)', color: 'var(--ink)'}}>Open workspace <ArrowUpRight size={15} /></Button>
          </Link>
        </div>
      </header>
      <main id="main">
        <section className={s.hero}>
          <div className={s.heroImage} aria-hidden="true" />
          <div className={s.heroContent}>
            <span className={s.heroEyebrow}>BUILT FOR INDUSTRIAL SERVICE TEAMS</span>
            <h1>Good machines.<br /><em>Keep them running.</em></h1>
            <p>Get the right people and parts to the job.<br />Handle the changes. Keep a record of the work.</p>
            <div className={s.heroActions}>
              <Link href="/control" passHref>
                <Button variant="primary" className={s.orangeButton}>Go to the control room <ArrowUpRight size={18} /></Button>
              </Link>
              <a href="#service-desk" style={{display:'inline-flex', alignItems:'center', gap:'8px'}}>Find a service job <ArrowRight size={16} /></a>
            </div>
          </div>
        </section>
        
        <div className={s.content}>
          <ServiceDesk />

          <section id="how-it-works" className={s.workflow}>
            <SectionHeader 
              title="How Rivet handles a service job" 
              description="Example scenario — not live data"
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
                      onKeyDown={e => {
                        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                          e.preventDefault();
                          const next = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (stage + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
                          setStage(next);
                          document.getElementById(`stage-tab-${next}`)?.focus();
                        }
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div id="workflow-panel" role="tabpanel" aria-labelledby={`stage-tab-${stage}`} tabIndex={0}>
                  <StageIcon className={s.stageIcon} size={26} strokeWidth={1.3} />
                  <h3>{stages[stage].title}</h3>
                  <p>{stages[stage].description}</p>
                </div>
              </div>
              <WorkflowPreview step={stage} />
            </div>
          </section>

          <section className={s.shortcutsSection} aria-label="Workspace shortcuts">
            <SectionHeader title="Where to go" />
            <div className={s.shortcuts}>
              {shortcuts.map(({ href, title, description }) => (
                <Link key={href} href={href}>
                  <h2>{title} <ArrowRight size={14} /></h2>
                  <p>{description}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
      <footer className={s.footer}>
        <Link href="/" aria-label="Rivet home"><Logo variant="light" /></Link>
        <div style={{display:'flex', gap:'24px', flexWrap:'wrap', fontSize:'13px', color:'var(--subtle)'}}>
          <Link href="/control">Control room</Link>
          <Link href="/portal">Customer approvals</Link>
          <Link href="/verify">Service records</Link>
        </div>
        <small>Illustrative imagery</small>
      </footer>
    </div>
  );
}
