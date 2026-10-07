'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api, useSession } from '../../lib/api';
import { subscribeEvents } from '../../lib/ws';
import s from './control.module.css';
import { Plus, Wrench, Box, Route, Check, AlertTriangle, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { CommitmentGraph } from '../../components/commitment-graph';
import { PlanRanking } from '../../components/plan-ranking';
import { ReconciliationTable } from '../../components/reconciliation-table';
import { Button } from '../../components/ui/button';

type TechnicianCandidate = {
  id: string;
  name: string;
  eligible: boolean;
  reason_codes: string[];
  travel_minutes: number;
  contractor?: boolean;
};

type Commitment = {
  id: string;
  type: string;
  resource?: string;
  quantity?: number;
  state: string;
  owner?: string;
  physical_location?: string;
  source?: string;
};

type Job = {
  id: string;
  request_id?: string;
  machine_id: string;
  site_id: string;
  priority: string;
  fault: string;
  state: string;
  technician_id?: string;
  deadline: string;
  planned_start?: string;
  duration_minutes: number;
  planned_parts: Record<string, number>;
  issued_parts: Record<string, number>;
  commitments?: Commitment[];
  candidates?: TechnicianCandidate[];
  report?: any;
  report_hash?: string;
  acceptance?: string;
};

type ServiceRequest = {
  id: string;
  job_id: string;
  validation?: Record<string, unknown>;
};

const currency = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;
const clock = (v?: string) =>
  v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—';

export default function ControlRoom() {
  const { session } = useSession();
  const selectedId = useRef<string | null>(null);
  const requestedJobOpened = useRef(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [risk, setRisk] = useState<any[]>([]);
  const [recovery, setRecovery] = useState<any>(null);
  const [selected, setSelected] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('impact');
  const [tech, setTech] = useState('ravi');
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [candidate, setCandidate] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [j, r] = await Promise.all([api<any>('/jobs'), api<any[]>('/exceptions/risk')]);
      setJobs(Array.isArray(j) ? j : j.items || j.jobs || []);
      setRisk(r);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [session]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!session) return;
    return subscribeEvents(() => load(), setOnline);
  }, [session, load]);

  async function action(fn: () => Promise<any>, message: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await fn();
      setNotice(message);
      await load();
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openJob(job: Job) {
    selectedId.current = job.id;
    setSelected(job);
    setRequest(null);
    setCandidate('');
    try {
      const detail = await api<Job>(`/jobs/${job.id}`);
      if (selectedId.current !== job.id) return;
      setSelected(detail);
      if (detail.request_id) {
        const validated = await api<ServiceRequest>(`/requests/${detail.request_id}`);
        if (selectedId.current === job.id) setRequest(validated);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function dismiss() {
    selectedId.current = null;
    setSelected(null);
  }

  useEffect(() => {
    if (!session || !jobs.length || requestedJobOpened.current) return;
    requestedJobOpened.current = true;
    const requestedId = new URLSearchParams(window.location.search).get('job');
    const requested = jobs.find(job => job.id === requestedId);
    if (requested) void openJob(requested);
  }, [jobs, session]);

  async function inspect() {
    setBusy(true);
    try {
      const data = await api(`/exceptions/plans/${tech}`);
      setRecovery(data);
      setTab('impact');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function drop() {
    const result = await action(
      () =>
        api(`/exceptions/dropout/${tech}`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'Unavailable for the rest of the shift' }),
        }),
      'Dropout recorded. Recovery options were computed against current reservations.'
    );
    if (result) {
      setRecovery(result);
      setTab('plans');
    }
  }

  async function approve(id: string) {
    const result = await action(
      () => api(`/exceptions/plans/${id}/approve`, { method: 'POST', body: '{}' }),
      'Recovery plan applied. Reassigned technician and resource reservations are active.'
    );
    if (result) setRecovery(null);
  }

  async function create() {
    const result = await action(
      () =>
        api('/requests', {
          method: 'POST',
          body: JSON.stringify({
            machine_id: 'M-104',
            fault: 'hydraulic_leak',
            source: 'control-room',
            description: 'Hydraulic pressure dropped below operating threshold',
          }),
        }),
      'M-104 service request validated and initialized.'
    );
    if (result) {
      const all = await api<any>('/jobs');
      const list = Array.isArray(all) ? all : all.items || all.jobs || [];
      const job = list.find((j: Job) => j.id === result.job_id);
      if (job) await openJob(job);
    }
  }

  const visible = jobs.filter(
    j =>
      filter === 'all' ||
      (filter === 'risk' ? risk.some(r => r.job_id === j.id && r.score > 0) : j.priority === filter)
  );
  const active = jobs.filter(j => !['closed', 'cancelled', 'completed'].includes(j.state));
  const atRisk = risk.filter(r => r.score > 0);
  const graph = recovery?.impact;

  return (
    <div className={s.shell}>
      {/* Top Telemetry Header */}
      <div className={s.eyebrow}>
        <span className={s.dot} />
        <span>DISPATCH & SERVICE NETWORK CONTROL</span>
        <span className={`${s.live} ${online ? s.connected : ''}`}>
          {online ? 'LIVE WEBSOCKET STREAM' : 'AUTO-POLLING REFRESH'}
        </span>
      </div>

      <header className={s.heading}>
        <div className={s.headingText}>
          <h1>
            Service <span>Control</span>
          </h1>
          <p>
            Field technicians in place. Spare parts reserved.<br />
            Maintain operational flow across all customer sites.
          </p>
        </div>

        <div className={s.schematic} aria-hidden="true">
          <svg viewBox="0 0 240 130" fill="none">
            <path d="M15 100h210M35 100V27h155v73M50 27v16h125V27M88 43v32h48V43M74 82h76v18M112 10v17M82 12h60M20 113h195" stroke="currentColor" strokeWidth="1" />
            <circle cx="190" cy="58" r="17" stroke="currentColor" />
            <path d="m190 58 8-9M190 75v25M104 59h16M112 51v16" stroke="currentColor" />
            <path className={s.flowLine} d="M13 58h22V27h155v14" stroke="currentColor" strokeWidth="1.5" />
            <path d="M53 105v14m118-14v14M53 116h118" stroke="currentColor" />
            <text x="88" y="128" fill="currentColor" fontSize="6" fontFamily="monospace">
              HYDRAULIC CIRCUIT / 01
            </text>
          </svg>
        </div>

        <div className={s.headingActions}>
          <span className={s.sheetCode}>OPERATIONAL SPEC · RIVET-01</span>
          <button disabled={busy || !session} onClick={create} className={s.primary}>
            <Plus size={15} aria-hidden="true" /> New M-104 Request
          </button>
        </div>
      </header>

      {!session && (
        <div className={s.empty}>
          Sign in via the top bar to initialize operations telemetry. Coordinators can dispatch and recover jobs; manager approval is enforced for external contractors.
        </div>
      )}

      {error && <div role="alert" className={s.error}>{error}</div>}
      {notice && <div role="status" className={s.notice}>{notice}</div>}

      {/* 4 Telemetry KPI Cards */}
      <section className={s.metrics} aria-label="Operational Key Performance Indicators">
        <div>
          <label>OPEN ACTIVE JOBS</label>
          <strong>{active.length.toString().padStart(2, '0')}</strong>
          <small>Across customer facilities</small>
        </div>
        <div>
          <label>AT RISK JOBS</label>
          <strong className={s.orange}>{atRisk.length.toString().padStart(2, '0')}</strong>
          <small>Jobs requiring immediate intervention</small>
        </div>
        <div>
          <label>DISRUPTION IMPACT</label>
          <strong>{graph ? graph.affected_jobs.length : '—'}</strong>
          <small>{graph ? `${graph.commitments_walked} commitments traced` : 'Inspect a technician to trace propagation'}</small>
        </div>
        <div>
          <label>RECOVERY PLANS</label>
          <strong>{recovery?.plans?.length ?? '—'}</strong>
          <small>{recovery ? `${recovery.combinations_examined} candidate options simulated` : 'Simulate before applying schedule change'}</small>
        </div>
      </section>

      {/* 3-Column Operational Workspace */}
      <div className={s.workspace}>
        {/* Column 1: Dispatch Board */}
        <section className={s.panel}>
          <div className={s.panelhead}>
            <div>
              <span className={s.kicker}>DISPATCH SCHEDULE</span>
              <h2>Active Operations</h2>
            </div>
            <div className={s.filters}>
              {['all', 'risk', 'P1', 'P2'].map(f => (
                <button
                  key={f}
                  className={filter === f ? s.chosen : ''}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All Jobs' : f === 'risk' ? 'At Risk' : f}
                </button>
              ))}
            </div>
          </div>

          <div className={s.tablewrap}>
            <table>
              <thead>
                <tr>
                  <th>Equipment / Job</th>
                  <th>Priority</th>
                  <th>Assigned Tech</th>
                  <th>Start → Deadline</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(j => (
                  <tr
                    key={j.id}
                    onClick={() => openJob(j)}
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter') openJob(j);
                    }}
                  >
                    <td>
                      <b>{j.machine_id}</b>
                      <small>
                        {j.id} · {j.site_id.replace('site-', 'Site ').toUpperCase()}
                      </small>
                    </td>
                    <td>
                      <span className={j.priority === 'P1' ? s.priority : s.neutral}>{j.priority}</span>
                    </td>
                    <td>
                      <span className={s.avatar}>{(j.technician_id || '?')[0].toUpperCase()}</span>
                      {j.technician_id || 'Unassigned'}
                    </td>
                    <td>
                      {clock(j.planned_start)} <span className={s.muted}>→</span> {clock(j.deadline)}
                      <small>IST · {j.duration_minutes}m duration</small>
                    </td>
                    <td>
                      <span className={s.state}>{j.state.replaceAll('_', ' ')}</span>
                      {risk.find(r => r.job_id === j.id)?.score > 0 && <span className={s.riskmark}> ●</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <div className={s.empty}>
                {session ? 'No jobs match this filter. Click "New M-104 Request" to dispatch.' : 'Operations telemetry will appear after sign-in.'}
              </div>
            )}
          </div>
        </section>

        {/* Column 2: Disruption Recovery */}
        <section className={s.panel}>
          <div className={s.panelhead}>
            <div>
              <span className={s.kicker}>PROPAGATION & RECOVERY</span>
              <h2>Schedule Solver</h2>
            </div>
            <span className={s.outlinebadge}>48-HR HORIZON</span>
          </div>

          <div className={s.toolbar}>
            <label>
              Technician
              <select value={tech} onChange={e => setTech(e.target.value)}>
                <option value="ravi">Ravi Shankar</option>
                <option value="priya">Priya Nair</option>
                <option value="karthik">Karthik Raja</option>
                <option value="dev">Dev Verma</option>
              </select>
            </label>
            <button disabled={busy || !session} onClick={inspect} className={s.secondaryBtn}>
              Inspect Impact
            </button>
            <button className={s.danger} disabled={busy || !session} onClick={drop}>
              Report Dropout
            </button>
          </div>

          {recovery ? (
            <>
              <div className={s.tabs}>
                <button
                  onClick={() => setTab('impact')}
                  className={tab === 'impact' ? s.activetab : ''}
                >
                  Impact Graph <span>{graph.affected_jobs.length}</span>
                </button>
                <button
                  onClick={() => setTab('plans')}
                  className={tab === 'plans' ? s.activetab : ''}
                >
                  Recovery Plans <span>{recovery.plans.length}</span>
                </button>
              </div>
              {tab === 'impact' && (
                <CommitmentGraph
                  impact={graph}
                  jobs={jobs}
                  risk={risk}
                  technicianName={tech.charAt(0).toUpperCase() + tech.slice(1)}
                  onOpenJob={id => {
                    const job = jobs.find(j => j.id === id);
                    if (job) openJob(job);
                  }}
                />
              )}
              {tab === 'plans' && (
                <PlanRanking recovery={recovery} busy={busy} role={session?.role || ''} onApprove={approve} />
              )}
            </>
          ) : (
            <div className={s.graphplaceholder}>
              <div aria-hidden="true">
                <Wrench size={22} strokeWidth={1.5} />
                <i />
                <Route size={24} strokeWidth={1.5} />
                <i />
                <Box size={22} strokeWidth={1.5} />
              </div>
              <h3>Trace Cascading Schedule Impacts</h3>
              <p>
                When a technician becomes unavailable or a part is delayed, see exactly how commitments propagate through downstream jobs before executing a recovery.
              </p>
              <span>SELECT TECHNICIAN ABOVE TO TRACE COMMITMENT GRAPH</span>
            </div>
          )}
        </section>

        {/* Column 3: Early Warning Risk Lane */}
        <aside className={s.panel}>
          <div className={s.panelhead}>
            <div>
              <span className={s.kicker}>EARLY WARNING</span>
              <h2>Risk Radar</h2>
            </div>
            <span className={s.orangecount}>{atRisk.length} active</span>
          </div>

          <p className={s.asidenote}>
            Risk scores synthesize travel delays, SLA margins, and part availability.
          </p>

          {risk.map(r => (
            <button
              key={r.job_id}
              className={s.riskcard}
              onClick={() => {
                const job = jobs.find(j => j.id === r.job_id);
                if (job) openJob(job);
              }}
            >
              <div>
                <b>{r.machine_id}</b>
                <span className={r.score > 0 ? s.orange : s.muted}>
                  {r.score}<small>/100</small>
                </span>
              </div>
              <p>
                {r.job_id} · {r.priority}
              </p>
              <div className={s.riskbar}>
                <i style={{ width: `${r.score}%` }} />
              </div>
              {r.signals.length ? (
                r.signals.map((signal: any) => (
                  <small key={signal.signal}>
                    {signal.signal} · +{signal.points} pts
                  </small>
                ))
              ) : (
                <small>No risk signals · {r.sla_margin_minutes}m SLA margin</small>
              )}
            </button>
          ))}
        </aside>
      </div>

      {/* Slide-out Job Inspection Drawer */}
      {selected && (
        <div className={s.overlay} onClick={dismiss}>
          <section className={s.drawer} onClick={e => e.stopPropagation()}>
            <button className={s.close} onClick={dismiss} aria-label="Close job details">
              ×
            </button>
            <span className={s.kicker}>EQUIPMENT DOSSIER · {selected.id}</span>
            <h2>{selected.machine_id}</h2>
            <p>
              {selected.fault.replaceAll('_', ' ')} · {selected.site_id.toUpperCase()}
            </p>

            <div style={{ display: 'flex', gap: '8px', margin: '12px 0 20px' }}>
              <span className={selected.priority === 'P1' ? s.priority : s.neutral}>{selected.priority}</span>
              <span className={s.state}>{selected.state.replaceAll('_', ' ')}</span>
            </div>

            <h3>Service Window Telemetry</h3>
            <div className={s.detailgrid}>
              <div>
                <small>ASSIGNED TECHNICIAN</small>
                <b>{selected.technician_id || 'Awaiting Allocation'}</b>
              </div>
              <div>
                <small>SLA DEADLINE · IST</small>
                <b>{clock(selected.deadline)}</b>
              </div>
              <div>
                <small>PLANNED START</small>
                <b>{clock(selected.planned_start)}</b>
              </div>
              <div>
                <small>EXPECTED DURATION</small>
                <b>{selected.duration_minutes} minutes</b>
              </div>
            </div>

            <h3>Parts Required & Issuance</h3>
            {Object.entries(selected.planned_parts || {}).map(([part, qty]) => (
              <div key={part} className={s.resource}>
                <b>{part}</b>
                <span>
                  {qty} required · {selected.issued_parts?.[part] || 0} issued
                </span>
              </div>
            ))}

            <h3>Reservations & Custody Holds</h3>
            {(selected.commitments || [])
              .filter(c => ['PART_HOLD', 'TOOL_HOLD', 'TECH_TIME', 'TECH_ASSIGN'].includes(c.type))
              .map(c => (
                <div key={c.id} className={s.custody}>
                  <div>
                    <b>{c.resource === 'TIME' ? 'Technician Time' : c.resource || c.type}</b>
                    <span className={s.state}>{c.state}</span>
                  </div>
                  <small>{c.quantity || 1} units · {c.owner || 'Unassigned Owner'}</small>
                  <small>
                    {c.physical_location
                      ? `Physical Location: ${c.physical_location}`
                      : c.source
                      ? `Reserved From: ${c.source}`
                      : 'Location awaits field confirmation'}
                  </small>
                </div>
              ))}
            {!selected.commitments?.length && (
              <p className={s.muted}>No recorded reservations yet.</p>
            )}

            {selected.report && (
              <>
                <h3>Evidence Reconciliation</h3>
                <ReconciliationTable job={selected} />
              </>
            )}

            {request?.validation && (
              <>
                <h3>Request Validation</h3>
                {Object.entries(request.validation).map(([k, v]) => (
                  <div className={s.resource} key={k}>
                    <span>{k}</span>
                    <b className={v === true ? s.green : ''}>
                      {typeof v === 'boolean' ? (v ? 'Passed' : 'Needs Attention') : String(v)}
                    </b>
                  </div>
                ))}
              </>
            )}

            <h3>Ranked Technician Candidates</h3>
            {(selected.candidates || []).map((t, index) => (
              <div key={t.id} className={s.candidate}>
                <span className={s.candidateRank}>{index + 1}</span>
                <div>
                  <b>{t.name} · {t.travel_minutes}m travel</b>
                  <small>
                    {t.eligible
                      ? t.contractor
                        ? 'Approved contractor · manager approval in recovery'
                        : 'Qualified for assignment'
                      : t.reason_codes.join(' · ').replaceAll('_', ' ').toLowerCase()}
                  </small>
                </div>
                <span className={t.eligible ? s.green : s.muted}>{t.eligible ? '✓' : '×'}</span>
              </div>
            ))}

            {['pending_approval', 'approved'].includes(selected.state) && (
              <div className={s.dispatch}>
                <h3>Dispatch Execution</h3>
                {selected.state === 'pending_approval' ? (
                  <button
                    disabled={busy}
                    className={s.primary}
                    onClick={() =>
                      action(
                        () =>
                          api(`/requests/${selected.request_id || selected.id.replace('J-', 'R-')}/approve`, {
                            method: 'POST',
                            body: '{}',
                          }),
                        'Request approved.'
                      ).then(result => {
                        if (result) dismiss();
                      })
                    }
                  >
                    Approve Service Request
                  </button>
                ) : (
                  <>
                    <label>
                      Technician Selection
                      <select value={candidate} onChange={e => setCandidate(e.target.value)}>
                        <option value="">Best Qualified (Auto-Ranked)</option>
                        {(selected.candidates || []).map(t => (
                          <option key={t.id} value={t.id} disabled={!t.eligible || t.contractor}>
                            {t.name} · {t.travel_minutes}m travel
                            {!t.eligible ? ` · ${t.reason_codes.join(', ')}` : t.contractor ? ' · manager recovery required' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className={s.primary}
                      disabled={busy || !selected.candidates?.some(t => t.eligible && !t.contractor)}
                      onClick={() =>
                        action(
                          () =>
                            api(`/jobs/${selected.id}/assign`, {
                              method: 'POST',
                              body: JSON.stringify({ technician_id: candidate || null }),
                            }),
                          'Technician assigned and resources reserved.'
                        ).then(result => {
                          if (result) dismiss();
                        })
                      }
                    >
                      Assign & Reserve Resources →
                    </button>
                  </>
                )}
              </div>
            )}

            <h3>Risk Diagnostic</h3>
            {(risk.find(r => r.job_id === selected.id)?.signals || []).map((signal: any) => (
              <div className={s.signal} key={signal.signal}>
                <b>
                  {signal.signal} <span>+{signal.points} pts</span>
                </b>
                <p>{signal.detail}</p>
              </div>
            ))}
            {!risk.find(r => r.job_id === selected.id)?.signals.length && (
              <p className={s.muted}>No active operational risk signals detected.</p>
            )}

            <a className={s.customerlink} href={`/portal?job=${selected.id}`}>
              Open Customer Approval & Evidence Portal <ArrowRight size={14} />
            </a>
          </section>
        </div>
      )}
    </div>
  );
}
